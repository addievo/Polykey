import fs from 'fs'
import os from 'os'
import path from 'path'
import webpack from 'webpack'
import * as dts from 'npm-dts'

class DeclarationBundlePlugin {
  ignoreDeclarations: boolean;
  entryFilePath: string;
  outputFilePath: string;
  singleFile: boolean;
  moduleName: string;

  constructor(options: {
    ignoreDeclarations?: boolean,
    entry?: string,
    output?: string,
    singleFile?: boolean,
    moduleName?: string
  }) {
    this.ignoreDeclarations = options.ignoreDeclarations ?? false
    this.entryFilePath = options.entry ?? ''
    this.outputFilePath = options.output ?? ''
    this.singleFile = options.singleFile ?? false
    this.moduleName = options.moduleName ?? ''
  }

  log(message: string) {
    console.log(`[DeclarationBundlePlugin] ${message}`);
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.emit.tap('TypescriptDeclarationPlugin', this.fn.bind(this));
  }

  async fn(compilation: webpack.compilation.Compilation) {
    // Search for declaration files.
    const declarationFiles: string[] = []

    // Create temporary working directory
    const tempDir = fs.mkdtempSync(`${os.tmpdir()}/typescript-temp`)

    // write all .d.ts files to tempDir
    for (const name in compilation.assets) {
      if (name.indexOf('.d.ts') != -1) {
        const filename = name
        const filepath = path.join(tempDir, filename)
        fs.mkdirSync(path.dirname(filepath), { recursive: true })
        fs.writeFileSync(filepath, compilation.assets[name].source())
        declarationFiles.push(filepath)
        // Delete from assets
        delete compilation.assets[name];
      }
    }

    if (!this.ignoreDeclarations && !this.singleFile) {
      if (declarationFiles.length == 0) {
        this.log('No .d.ts files were found');
        this.log('Make sure "declaration": true is set in tsconfig.ts');
        return
      }

      const entry = path.join(tempDir, `${this.entryFilePath.slice(0, this.entryFilePath.length - 3)}.d.ts`)
      const generator = new dts.Generator({ entry, output: this.outputFilePath }, true, true)
      await generator.generate()

      // Fix the require at the end of the file to poifnt to the module name
      const requireRegex = /(require\('.*'\))/
      const contents = fs.readFileSync(this.outputFilePath).toString()
      const lines = contents.split('\n')
      const matches = lines.filter((line) => {
        return requireRegex.test(line)
      })
      if (matches.length != 0) {
        const moduleImportName = path.join(this.moduleName, this.entryFilePath.slice(0, this.entryFilePath.length - 3))
        const newContents = Buffer.from(
          contents
            .replace(/\/index\'/g, "'")
            .replace(requireRegex, `require('${moduleImportName}')`)
        )

        fs.writeFileSync(this.outputFilePath, newContents)
      }
    } else if (this.singleFile) {
      const split = this.entryFilePath.split('.')
      const filename = split[split.length - 2]

      const entryFile = path.join(tempDir, `${filename}.d.ts`)
      fs.copyFileSync(entryFile, this.outputFilePath)
    }

    // Garbage collection
    fs.rmdirSync(tempDir, { recursive: true })
  }
}

export default DeclarationBundlePlugin;
