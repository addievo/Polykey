// package: clientInterface
// file: Client.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class EmptyMessage extends jspb.Message { 

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EmptyMessage.AsObject;
    static toObject(includeInstance: boolean, msg: EmptyMessage): EmptyMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EmptyMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EmptyMessage;
    static deserializeBinaryFromReader(message: EmptyMessage, reader: jspb.BinaryReader): EmptyMessage;
}

export namespace EmptyMessage {
    export type AsObject = {
    }
}

export class StatusMessage extends jspb.Message { 
    getSuccess(): boolean;
    setSuccess(value: boolean): StatusMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): StatusMessage.AsObject;
    static toObject(includeInstance: boolean, msg: StatusMessage): StatusMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: StatusMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): StatusMessage;
    static deserializeBinaryFromReader(message: StatusMessage, reader: jspb.BinaryReader): StatusMessage;
}

export namespace StatusMessage {
    export type AsObject = {
        success: boolean,
    }
}

export class EchoMessage extends jspb.Message { 
    getChallenge(): string;
    setChallenge(value: string): EchoMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): EchoMessage.AsObject;
    static toObject(includeInstance: boolean, msg: EchoMessage): EchoMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: EchoMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): EchoMessage;
    static deserializeBinaryFromReader(message: EchoMessage, reader: jspb.BinaryReader): EchoMessage;
}

export namespace EchoMessage {
    export type AsObject = {
        challenge: string,
    }
}

export class JWTTokenMessage extends jspb.Message { 
    getToken(): string;
    setToken(value: string): JWTTokenMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): JWTTokenMessage.AsObject;
    static toObject(includeInstance: boolean, msg: JWTTokenMessage): JWTTokenMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: JWTTokenMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): JWTTokenMessage;
    static deserializeBinaryFromReader(message: JWTTokenMessage, reader: jspb.BinaryReader): JWTTokenMessage;
}

export namespace JWTTokenMessage {
    export type AsObject = {
        token: string,
    }
}

export class VaultListMessage extends jspb.Message { 
    getName(): string;
    setName(value: string): VaultListMessage;
    getId(): string;
    setId(value: string): VaultListMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): VaultListMessage.AsObject;
    static toObject(includeInstance: boolean, msg: VaultListMessage): VaultListMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: VaultListMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): VaultListMessage;
    static deserializeBinaryFromReader(message: VaultListMessage, reader: jspb.BinaryReader): VaultListMessage;
}

export namespace VaultListMessage {
    export type AsObject = {
        name: string,
        id: string,
    }
}

export class VaultMessage extends jspb.Message { 

    hasName(): boolean;
    clearName(): void;
    getName(): string;
    setName(value: string): VaultMessage;

    hasId(): boolean;
    clearId(): void;
    getId(): string;
    setId(value: string): VaultMessage;

    getNameOrIdCase(): VaultMessage.NameOrIdCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): VaultMessage.AsObject;
    static toObject(includeInstance: boolean, msg: VaultMessage): VaultMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: VaultMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): VaultMessage;
    static deserializeBinaryFromReader(message: VaultMessage, reader: jspb.BinaryReader): VaultMessage;
}

export namespace VaultMessage {
    export type AsObject = {
        name: string,
        id: string,
    }

    export enum NameOrIdCase {
        NAMEORID_NOT_SET = 0,
        NAME = 1,
        ID = 2,
    }

}

export class VaultRenameMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): VaultRenameMessage;
    getNewname(): string;
    setNewname(value: string): VaultRenameMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): VaultRenameMessage.AsObject;
    static toObject(includeInstance: boolean, msg: VaultRenameMessage): VaultRenameMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: VaultRenameMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): VaultRenameMessage;
    static deserializeBinaryFromReader(message: VaultRenameMessage, reader: jspb.BinaryReader): VaultRenameMessage;
}

export namespace VaultRenameMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        newname: string,
    }
}

export class VaultMkdirMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): VaultMkdirMessage;
    getDirname(): string;
    setDirname(value: string): VaultMkdirMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): VaultMkdirMessage.AsObject;
    static toObject(includeInstance: boolean, msg: VaultMkdirMessage): VaultMkdirMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: VaultMkdirMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): VaultMkdirMessage;
    static deserializeBinaryFromReader(message: VaultMkdirMessage, reader: jspb.BinaryReader): VaultMkdirMessage;
}

export namespace VaultMkdirMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        dirname: string,
    }
}

export class VaultPullMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): VaultPullMessage;

    hasNode(): boolean;
    clearNode(): void;
    getNode(): NodeMessage | undefined;
    setNode(value?: NodeMessage): VaultPullMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): VaultPullMessage.AsObject;
    static toObject(includeInstance: boolean, msg: VaultPullMessage): VaultPullMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: VaultPullMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): VaultPullMessage;
    static deserializeBinaryFromReader(message: VaultPullMessage, reader: jspb.BinaryReader): VaultPullMessage;
}

export namespace VaultPullMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        node?: NodeMessage.AsObject,
    }
}

export class SecretRenameMessage extends jspb.Message { 

    hasOldsecret(): boolean;
    clearOldsecret(): void;
    getOldsecret(): SecretMessage | undefined;
    setOldsecret(value?: SecretMessage): SecretRenameMessage;
    getNewname(): string;
    setNewname(value: string): SecretRenameMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SecretRenameMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SecretRenameMessage): SecretRenameMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SecretRenameMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SecretRenameMessage;
    static deserializeBinaryFromReader(message: SecretRenameMessage, reader: jspb.BinaryReader): SecretRenameMessage;
}

export namespace SecretRenameMessage {
    export type AsObject = {
        oldsecret?: SecretMessage.AsObject,
        newname: string,
    }
}

export class SecretMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): SecretMessage;
    getName(): string;
    setName(value: string): SecretMessage;
    getContent(): string;
    setContent(value: string): SecretMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SecretMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SecretMessage): SecretMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SecretMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SecretMessage;
    static deserializeBinaryFromReader(message: SecretMessage, reader: jspb.BinaryReader): SecretMessage;
}

export namespace SecretMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        name: string,
        content: string,
    }
}

export class SecretEditMessage extends jspb.Message { 

    hasSecret(): boolean;
    clearSecret(): void;
    getSecret(): SecretMessage | undefined;
    setSecret(value?: SecretMessage): SecretEditMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SecretEditMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SecretEditMessage): SecretEditMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SecretEditMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SecretEditMessage;
    static deserializeBinaryFromReader(message: SecretEditMessage, reader: jspb.BinaryReader): SecretEditMessage;
}

export namespace SecretEditMessage {
    export type AsObject = {
        secret?: SecretMessage.AsObject,
    }
}

export class SecretDirectoryMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): SecretDirectoryMessage;
    getSecretdirectory(): string;
    setSecretdirectory(value: string): SecretDirectoryMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SecretDirectoryMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SecretDirectoryMessage): SecretDirectoryMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SecretDirectoryMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SecretDirectoryMessage;
    static deserializeBinaryFromReader(message: SecretDirectoryMessage, reader: jspb.BinaryReader): SecretDirectoryMessage;
}

export namespace SecretDirectoryMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        secretdirectory: string,
    }
}

export class StatMessage extends jspb.Message { 
    getStats(): string;
    setStats(value: string): StatMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): StatMessage.AsObject;
    static toObject(includeInstance: boolean, msg: StatMessage): StatMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: StatMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): StatMessage;
    static deserializeBinaryFromReader(message: StatMessage, reader: jspb.BinaryReader): StatMessage;
}

export namespace StatMessage {
    export type AsObject = {
        stats: string,
    }
}

export class SetVaultPermMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): SetVaultPermMessage;

    hasNode(): boolean;
    clearNode(): void;
    getNode(): NodeMessage | undefined;
    setNode(value?: NodeMessage): SetVaultPermMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SetVaultPermMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SetVaultPermMessage): SetVaultPermMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SetVaultPermMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SetVaultPermMessage;
    static deserializeBinaryFromReader(message: SetVaultPermMessage, reader: jspb.BinaryReader): SetVaultPermMessage;
}

export namespace SetVaultPermMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        node?: NodeMessage.AsObject,
    }
}

export class UnsetVaultPermMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): UnsetVaultPermMessage;

    hasNode(): boolean;
    clearNode(): void;
    getNode(): NodeMessage | undefined;
    setNode(value?: NodeMessage): UnsetVaultPermMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): UnsetVaultPermMessage.AsObject;
    static toObject(includeInstance: boolean, msg: UnsetVaultPermMessage): UnsetVaultPermMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: UnsetVaultPermMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): UnsetVaultPermMessage;
    static deserializeBinaryFromReader(message: UnsetVaultPermMessage, reader: jspb.BinaryReader): UnsetVaultPermMessage;
}

export namespace UnsetVaultPermMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        node?: NodeMessage.AsObject,
    }
}

export class GetVaultPermMessage extends jspb.Message { 

    hasVault(): boolean;
    clearVault(): void;
    getVault(): VaultMessage | undefined;
    setVault(value?: VaultMessage): GetVaultPermMessage;

    hasNode(): boolean;
    clearNode(): void;
    getNode(): NodeMessage | undefined;
    setNode(value?: NodeMessage): GetVaultPermMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GetVaultPermMessage.AsObject;
    static toObject(includeInstance: boolean, msg: GetVaultPermMessage): GetVaultPermMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GetVaultPermMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GetVaultPermMessage;
    static deserializeBinaryFromReader(message: GetVaultPermMessage, reader: jspb.BinaryReader): GetVaultPermMessage;
}

export namespace GetVaultPermMessage {
    export type AsObject = {
        vault?: VaultMessage.AsObject,
        node?: NodeMessage.AsObject,
    }
}

export class PermissionMessage extends jspb.Message { 
    getId(): string;
    setId(value: string): PermissionMessage;
    getAction(): string;
    setAction(value: string): PermissionMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): PermissionMessage.AsObject;
    static toObject(includeInstance: boolean, msg: PermissionMessage): PermissionMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: PermissionMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): PermissionMessage;
    static deserializeBinaryFromReader(message: PermissionMessage, reader: jspb.BinaryReader): PermissionMessage;
}

export namespace PermissionMessage {
    export type AsObject = {
        id: string,
        action: string,
    }
}

export class NodeMessage extends jspb.Message { 
    getName(): string;
    setName(value: string): NodeMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NodeMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NodeMessage): NodeMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NodeMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NodeMessage;
    static deserializeBinaryFromReader(message: NodeMessage, reader: jspb.BinaryReader): NodeMessage;
}

export namespace NodeMessage {
    export type AsObject = {
        name: string,
    }
}

export class NodeAddressMessage extends jspb.Message { 
    getId(): string;
    setId(value: string): NodeAddressMessage;
    getHost(): string;
    setHost(value: string): NodeAddressMessage;
    getPort(): number;
    setPort(value: number): NodeAddressMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NodeAddressMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NodeAddressMessage): NodeAddressMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NodeAddressMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NodeAddressMessage;
    static deserializeBinaryFromReader(message: NodeAddressMessage, reader: jspb.BinaryReader): NodeAddressMessage;
}

export namespace NodeAddressMessage {
    export type AsObject = {
        id: string,
        host: string,
        port: number,
    }
}

export class NodeDetailsMessage extends jspb.Message { 
    getNodeId(): string;
    setNodeId(value: string): NodeDetailsMessage;
    getPublicKey(): string;
    setPublicKey(value: string): NodeDetailsMessage;
    getNodeAddress(): string;
    setNodeAddress(value: string): NodeDetailsMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NodeDetailsMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NodeDetailsMessage): NodeDetailsMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NodeDetailsMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NodeDetailsMessage;
    static deserializeBinaryFromReader(message: NodeDetailsMessage, reader: jspb.BinaryReader): NodeDetailsMessage;
}

export namespace NodeDetailsMessage {
    export type AsObject = {
        nodeId: string,
        publicKey: string,
        nodeAddress: string,
    }
}

export class CryptoMessage extends jspb.Message { 
    getData(): string;
    setData(value: string): CryptoMessage;
    getSignature(): string;
    setSignature(value: string): CryptoMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CryptoMessage.AsObject;
    static toObject(includeInstance: boolean, msg: CryptoMessage): CryptoMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CryptoMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CryptoMessage;
    static deserializeBinaryFromReader(message: CryptoMessage, reader: jspb.BinaryReader): CryptoMessage;
}

export namespace CryptoMessage {
    export type AsObject = {
        data: string,
        signature: string,
    }
}

export class KeyMessage extends jspb.Message { 
    getName(): string;
    setName(value: string): KeyMessage;
    getKey(): string;
    setKey(value: string): KeyMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): KeyMessage.AsObject;
    static toObject(includeInstance: boolean, msg: KeyMessage): KeyMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: KeyMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): KeyMessage;
    static deserializeBinaryFromReader(message: KeyMessage, reader: jspb.BinaryReader): KeyMessage;
}

export namespace KeyMessage {
    export type AsObject = {
        name: string,
        key: string,
    }
}

export class KeyPairMessage extends jspb.Message { 
    getPublic(): string;
    setPublic(value: string): KeyPairMessage;
    getPrivate(): string;
    setPrivate(value: string): KeyPairMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): KeyPairMessage.AsObject;
    static toObject(includeInstance: boolean, msg: KeyPairMessage): KeyPairMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: KeyPairMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): KeyPairMessage;
    static deserializeBinaryFromReader(message: KeyPairMessage, reader: jspb.BinaryReader): KeyPairMessage;
}

export namespace KeyPairMessage {
    export type AsObject = {
        pb_public: string,
        pb_private: string,
    }
}

export class CertificateMessage extends jspb.Message { 
    getCert(): string;
    setCert(value: string): CertificateMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): CertificateMessage.AsObject;
    static toObject(includeInstance: boolean, msg: CertificateMessage): CertificateMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: CertificateMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): CertificateMessage;
    static deserializeBinaryFromReader(message: CertificateMessage, reader: jspb.BinaryReader): CertificateMessage;
}

export namespace CertificateMessage {
    export type AsObject = {
        cert: string,
    }
}

export class PasswordMessage extends jspb.Message { 
    getPassword(): string;
    setPassword(value: string): PasswordMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): PasswordMessage.AsObject;
    static toObject(includeInstance: boolean, msg: PasswordMessage): PasswordMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: PasswordMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): PasswordMessage;
    static deserializeBinaryFromReader(message: PasswordMessage, reader: jspb.BinaryReader): PasswordMessage;
}

export namespace PasswordMessage {
    export type AsObject = {
        password: string,
    }
}

export class ProviderMessage extends jspb.Message { 
    getId(): string;
    setId(value: string): ProviderMessage;
    getMessage(): string;
    setMessage(value: string): ProviderMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ProviderMessage.AsObject;
    static toObject(includeInstance: boolean, msg: ProviderMessage): ProviderMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ProviderMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ProviderMessage;
    static deserializeBinaryFromReader(message: ProviderMessage, reader: jspb.BinaryReader): ProviderMessage;
}

export namespace ProviderMessage {
    export type AsObject = {
        id: string,
        message: string,
    }
}

export class TokenSpecificMessage extends jspb.Message { 

    hasProvider(): boolean;
    clearProvider(): void;
    getProvider(): ProviderMessage | undefined;
    setProvider(value?: ProviderMessage): TokenSpecificMessage;
    getToken(): string;
    setToken(value: string): TokenSpecificMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TokenSpecificMessage.AsObject;
    static toObject(includeInstance: boolean, msg: TokenSpecificMessage): TokenSpecificMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TokenSpecificMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TokenSpecificMessage;
    static deserializeBinaryFromReader(message: TokenSpecificMessage, reader: jspb.BinaryReader): TokenSpecificMessage;
}

export namespace TokenSpecificMessage {
    export type AsObject = {
        provider?: ProviderMessage.AsObject,
        token: string,
    }
}

export class TokenMessage extends jspb.Message { 
    getToken(): string;
    setToken(value: string): TokenMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TokenMessage.AsObject;
    static toObject(includeInstance: boolean, msg: TokenMessage): TokenMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: TokenMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TokenMessage;
    static deserializeBinaryFromReader(message: TokenMessage, reader: jspb.BinaryReader): TokenMessage;
}

export namespace TokenMessage {
    export type AsObject = {
        token: string,
    }
}

export class ProviderSearchMessage extends jspb.Message { 

    hasProvider(): boolean;
    clearProvider(): void;
    getProvider(): ProviderMessage | undefined;
    setProvider(value?: ProviderMessage): ProviderSearchMessage;
    clearSearchTermList(): void;
    getSearchTermList(): Array<string>;
    setSearchTermList(value: Array<string>): ProviderSearchMessage;
    addSearchTerm(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ProviderSearchMessage.AsObject;
    static toObject(includeInstance: boolean, msg: ProviderSearchMessage): ProviderSearchMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ProviderSearchMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ProviderSearchMessage;
    static deserializeBinaryFromReader(message: ProviderSearchMessage, reader: jspb.BinaryReader): ProviderSearchMessage;
}

export namespace ProviderSearchMessage {
    export type AsObject = {
        provider?: ProviderMessage.AsObject,
        searchTermList: Array<string>,
    }
}

export class IdentityInfoMessage extends jspb.Message { 

    hasProvider(): boolean;
    clearProvider(): void;
    getProvider(): ProviderMessage | undefined;
    setProvider(value?: ProviderMessage): IdentityInfoMessage;
    getName(): string;
    setName(value: string): IdentityInfoMessage;
    getEmail(): string;
    setEmail(value: string): IdentityInfoMessage;
    getUrl(): string;
    setUrl(value: string): IdentityInfoMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): IdentityInfoMessage.AsObject;
    static toObject(includeInstance: boolean, msg: IdentityInfoMessage): IdentityInfoMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: IdentityInfoMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): IdentityInfoMessage;
    static deserializeBinaryFromReader(message: IdentityInfoMessage, reader: jspb.BinaryReader): IdentityInfoMessage;
}

export namespace IdentityInfoMessage {
    export type AsObject = {
        provider?: ProviderMessage.AsObject,
        name: string,
        email: string,
        url: string,
    }
}

export class GestaltMessage extends jspb.Message { 
    getName(): string;
    setName(value: string): GestaltMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GestaltMessage.AsObject;
    static toObject(includeInstance: boolean, msg: GestaltMessage): GestaltMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GestaltMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GestaltMessage;
    static deserializeBinaryFromReader(message: GestaltMessage, reader: jspb.BinaryReader): GestaltMessage;
}

export namespace GestaltMessage {
    export type AsObject = {
        name: string,
    }
}

export class GestaltTrustMessage extends jspb.Message { 
    getProvider(): string;
    setProvider(value: string): GestaltTrustMessage;
    getName(): string;
    setName(value: string): GestaltTrustMessage;
    getSet(): boolean;
    setSet(value: boolean): GestaltTrustMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): GestaltTrustMessage.AsObject;
    static toObject(includeInstance: boolean, msg: GestaltTrustMessage): GestaltTrustMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: GestaltTrustMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): GestaltTrustMessage;
    static deserializeBinaryFromReader(message: GestaltTrustMessage, reader: jspb.BinaryReader): GestaltTrustMessage;
}

export namespace GestaltTrustMessage {
    export type AsObject = {
        provider: string,
        name: string,
        set: boolean,
    }
}

export class ActionsMessage extends jspb.Message { 
    clearActionList(): void;
    getActionList(): Array<string>;
    setActionList(value: Array<string>): ActionsMessage;
    addAction(value: string, index?: number): string;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ActionsMessage.AsObject;
    static toObject(includeInstance: boolean, msg: ActionsMessage): ActionsMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ActionsMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ActionsMessage;
    static deserializeBinaryFromReader(message: ActionsMessage, reader: jspb.BinaryReader): ActionsMessage;
}

export namespace ActionsMessage {
    export type AsObject = {
        actionList: Array<string>,
    }
}

export class SetActionsMessage extends jspb.Message { 

    hasNode(): boolean;
    clearNode(): void;
    getNode(): NodeMessage | undefined;
    setNode(value?: NodeMessage): SetActionsMessage;

    hasIdentity(): boolean;
    clearIdentity(): void;
    getIdentity(): ProviderMessage | undefined;
    setIdentity(value?: ProviderMessage): SetActionsMessage;
    getAction(): string;
    setAction(value: string): SetActionsMessage;

    getNodeOrProviderCase(): SetActionsMessage.NodeOrProviderCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): SetActionsMessage.AsObject;
    static toObject(includeInstance: boolean, msg: SetActionsMessage): SetActionsMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: SetActionsMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): SetActionsMessage;
    static deserializeBinaryFromReader(message: SetActionsMessage, reader: jspb.BinaryReader): SetActionsMessage;
}

export namespace SetActionsMessage {
    export type AsObject = {
        node?: NodeMessage.AsObject,
        identity?: ProviderMessage.AsObject,
        action: string,
    }

    export enum NodeOrProviderCase {
        NODE_OR_PROVIDER_NOT_SET = 0,
        NODE = 1,
        IDENTITY = 2,
    }

}

export class NotificationInfoMessage extends jspb.Message { 
    getReceiverId(): string;
    setReceiverId(value: string): NotificationInfoMessage;
    getMessage(): string;
    setMessage(value: string): NotificationInfoMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NotificationInfoMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NotificationInfoMessage): NotificationInfoMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NotificationInfoMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NotificationInfoMessage;
    static deserializeBinaryFromReader(message: NotificationInfoMessage, reader: jspb.BinaryReader): NotificationInfoMessage;
}

export namespace NotificationInfoMessage {
    export type AsObject = {
        receiverId: string,
        message: string,
    }
}

export class NotificationDisplayMessage extends jspb.Message { 
    getUnread(): boolean;
    setUnread(value: boolean): NotificationDisplayMessage;

    hasNumber(): boolean;
    clearNumber(): void;
    getNumber(): NumberMessage | undefined;
    setNumber(value?: NumberMessage): NotificationDisplayMessage;
    getOrder(): string;
    setOrder(value: string): NotificationDisplayMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NotificationDisplayMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NotificationDisplayMessage): NotificationDisplayMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NotificationDisplayMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NotificationDisplayMessage;
    static deserializeBinaryFromReader(message: NotificationDisplayMessage, reader: jspb.BinaryReader): NotificationDisplayMessage;
}

export namespace NotificationDisplayMessage {
    export type AsObject = {
        unread: boolean,
        number?: NumberMessage.AsObject,
        order: string,
    }
}

export class NotificationListMessage extends jspb.Message { 
    getMessages(): string;
    setMessages(value: string): NotificationListMessage;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NotificationListMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NotificationListMessage): NotificationListMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NotificationListMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NotificationListMessage;
    static deserializeBinaryFromReader(message: NotificationListMessage, reader: jspb.BinaryReader): NotificationListMessage;
}

export namespace NotificationListMessage {
    export type AsObject = {
        messages: string,
    }
}

export class NumberMessage extends jspb.Message { 

    hasNumber(): boolean;
    clearNumber(): void;
    getNumber(): number;
    setNumber(value: number): NumberMessage;

    hasAll(): boolean;
    clearAll(): void;
    getAll(): string;
    setAll(value: string): NumberMessage;

    getNumberOrAllCase(): NumberMessage.NumberOrAllCase;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): NumberMessage.AsObject;
    static toObject(includeInstance: boolean, msg: NumberMessage): NumberMessage.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: NumberMessage, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): NumberMessage;
    static deserializeBinaryFromReader(message: NumberMessage, reader: jspb.BinaryReader): NumberMessage;
}

export namespace NumberMessage {
    export type AsObject = {
        number: number,
        all: string,
    }

    export enum NumberOrAllCase {
        NUMBER_OR_ALL_NOT_SET = 0,
        NUMBER = 1,
        ALL = 2,
    }

}
