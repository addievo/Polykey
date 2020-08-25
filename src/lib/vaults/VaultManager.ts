import fs from 'fs';
import os from 'os';
import Path from 'path';
import git from 'isomorphic-git';
import Vault from '../vaults/Vault';
import GitRequest from '../git/GitRequest';
import { EncryptedFS } from 'encryptedfs';
import KeyManager from '../keys/KeyManager';

class VaultManager {
  polykeyPath: string;
  fileSystem: typeof fs;
  keyManager: KeyManager;

  metadataPath: string;
  vaults: Map<string, Vault>;
  vaultKeys: Map<string, Buffer>;
  constructor(polykeyPath: string = `${os.homedir()}/.polykey`, fileSystem: typeof fs, keyManager: KeyManager) {
    this.polykeyPath = polykeyPath;
    this.fileSystem = fileSystem;
    this.keyManager = keyManager;
    this.metadataPath = Path.join(polykeyPath, '.vaultKeys');

    // Make polykeyPath if it doesn't exist
    this.fileSystem.mkdirSync(this.polykeyPath, { recursive: true });

    // Initialize stateful variables
    this.vaults = new Map();
    this.vaultKeys = new Map();

    // Read in vault keys
    this.loadMetadata();
  }

  /**
   * Get a vault from the vault manager
   * @param vaultName Name of desired vault
   */
  getVault(vaultName: string): Vault {
    if (this.vaults.has(vaultName)) {
      const vault = this.vaults.get(vaultName);
      return vault!;
    } else if (this.vaultKeys.has(vaultName)) {
      // vault not in map, create new instance
      this.validateVault(vaultName);

      const vaultKey = this.vaultKeys.get(vaultName);

      const vault = new Vault(vaultName, vaultKey!, this.polykeyPath);
      this.vaults.set(vaultName, vault);
      return vault;
    } else {
      throw Error(`vault does not exist in memory: '${vaultName}'`);
    }
  }

  /**
   * Get a vault from the vault manager
   * @param vaultName Unique name of new vault
   * @param key Optional key to use for the vault encryption, otherwise it is generated
   */
  async createVault(vaultName: string, key?: Buffer): Promise<Vault> {
    if (this.vaultExists(vaultName)) {
      throw Error('Vault already exists!');
    }

    try {
      const path = Path.join(this.polykeyPath, vaultName);
      // Directory not present, create one
      this.fileSystem.mkdirSync(path, { recursive: true });
      // Create key if not provided
      let vaultKey: Buffer;
      if (!key) {
        // Generate new key
        vaultKey = await this.keyManager.generateKey(`${vaultName}-Key`, this.keyManager.getPrivateKey(), false);
      } else {
        // Assign key if it is provided
        vaultKey = key;
      }
      this.vaultKeys.set(vaultName, vaultKey);
      this.writeMetadata();

      // Create vault
      const vault = new Vault(vaultName, vaultKey, this.polykeyPath);

      // Init repository for vault
      const vaultPath = Path.join(this.polykeyPath, vaultName);
      const efs = vault.EncryptedFS;
      const fileSystem = { promises: efs.promises };
      await git.init({
        fs: fileSystem,
        dir: vaultPath,
      });

      // Initial commit
      await git.commit({
        fs: fileSystem,
        dir: vaultPath,
        author: {
          name: vaultName,
        },
        message: 'init commit',
      });
      // Write packed-refs file because isomorphic git goes searching for it
      // and apparently its not autogenerated
      efs.writeFileSync(Path.join(vaultPath, '.git', 'packed-refs'), '# pack-refs with: peeled fully-peeled sorted');

      // Set vault
      this.vaults.set(vaultName, vault);
      return this.getVault(vaultName);
    } catch (err) {
      // Delete vault dir and garbage collect
      this.destroyVault(vaultName);
      throw err;
    }
  }

  /**
   * Get a vault from the vault manager
   * @param vaultName Name of vault to be cloned
   * @param address Address of polykey node that owns vault to be cloned
   * @param getSocket Function to get an active connection to provided address
   */
  async cloneVault(vaultName: string, gitRequest: GitRequest): Promise<Vault> {
    // Confirm it doesn't exist locally already
    if (this.vaultExists(vaultName)) {
      throw Error('Vault name already exists locally, try pulling instead');
    }

    const vaultUrl = `http://0.0.0.0/${vaultName}`;

    // First check if it exists on remote
    const info = await git.getRemoteInfo({
      http: gitRequest,
      url: vaultUrl,
    });

    if (!info.refs) {
      throw Error(`Peer does not have vault: '${vaultName}'`);
    }

    // Create new efs first
    // Generate new key
    const vaultKey = await this.keyManager.generateKey(`${vaultName}-Key`, this.keyManager.getPrivateKey());

    // Set filesystem
    const vfsInstance = new (require('virtualfs').VirtualFS)();

    const newEfs = new EncryptedFS(vaultKey, vfsInstance, vfsInstance, this.fileSystem, process);

    // Clone vault from address
    await git.clone({
      fs: { promises: newEfs.promises },
      http: gitRequest,
      dir: Path.join(this.polykeyPath, vaultName),
      url: vaultUrl,
      ref: 'master',
      singleBranch: true,
    });

    // Finally return the vault
    const vault = new Vault(vaultName, vaultKey, this.polykeyPath);
    this.vaults.set(vaultName, vault);
    return vault;
  }

  /**
   * Determines whether the vault exists
   * @param vaultName Name of desired vault
   */
  vaultExists(vaultName: string): boolean {
    const path = Path.join(this.polykeyPath, vaultName);
    const vaultExists = this.fileSystem.existsSync(path);

    return vaultExists;
  }

  /**
   * [WARNING] Destroys a certain vault and all its secrets
   * @param vaultName Name of vault to be destroyed
   */
  destroyVault(vaultName: string) {
    // this is convenience function for removing all tags
    // and triggering garbage collection
    // destruction is a better word as we should ensure all traces is removed

    const path = Path.join(this.polykeyPath, vaultName);
    // Remove directory on file system
    if (this.fileSystem.existsSync(path)) {
      this.fileSystem.rmdirSync(path, { recursive: true });
    }

    // Remove from maps
    this.vaults.delete(vaultName);
    this.vaultKeys.delete(vaultName);

    // Write to metadata file
    this.writeMetadata();

    const vaultPathExists = this.fileSystem.existsSync(path);
    if (vaultPathExists) {
      throw Error('Vault folder could not be destroyed!');
    }
  }

  /**
   * List the names of all vaults in memory
   */
  listVaults(): string[] {
    return Array.from(this.vaults.keys());
  }

  /* ============ HELPERS =============== */
  private validateVault(vaultName: string): void {
    if (!this.vaults.has(vaultName)) {
      throw Error(`vault does not exist in memory: '${vaultName}'`);
    }
    if (!this.vaultKeys.has(vaultName)) {
      throw Error(`vault key does not exist in memory: '${vaultName}'`);
    }
    const vaultPath = Path.join(this.polykeyPath, vaultName);
    if (!this.fileSystem.existsSync(vaultPath)) {
      throw Error(`vault directory does not exist: '${vaultPath}'`);
    }
  }
  private async writeMetadata(): Promise<void> {
    const metadata = JSON.stringify([...this.vaultKeys]);
    const encryptedMetadata = await this.keyManager.encryptData(Buffer.from(metadata));
    await this.fileSystem.promises.writeFile(this.metadataPath, encryptedMetadata);
  }
  async loadMetadata(): Promise<void> {
    // Check if file exists
    if (this.fileSystem.existsSync(this.metadataPath) && this.keyManager.identityLoaded) {
      const encryptedMetadata = this.fileSystem.readFileSync(this.metadataPath);
      const metadata = (await this.keyManager.decryptData(encryptedMetadata)).toString();

      for (const [key, value] of new Map<string, any>(JSON.parse(metadata))) {
        this.vaultKeys.set(key, Buffer.from(value));
      }
      // Initialize vaults in memory
      for (const [vaultName, vaultKey] of this.vaultKeys.entries()) {
        const path = Path.join(this.polykeyPath, vaultName);

        if (this.fileSystem.existsSync(path)) {
          const vault = new Vault(vaultName, vaultKey, this.polykeyPath);
          this.vaults.set(vaultName, vault);
        }
      }
    }
  }
}

export default VaultManager;
