import {Connection, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY} from "@solana/web3.js";
import {COption} from "@metaplex-foundation/beet";
import {Buffer} from "buffer";
import {ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID,} from "@solana/spl-token";
import {
    createCreateInstruction,
    createMintInstruction,
    createPrintInstruction,
    createVerifyInstruction,
    MasterEditionV2,
    Metadata,
    PrintSupply,
    PROGRAM_ID,
    TokenStandard,
    VerificationArgs
} from "./mpl-token-metadata/generated";

export interface NFTxDataJson {
    name: string,
    symbol: string,
    image: string,
    uri?: string,
    collection?: string,
}

export class NFTx {
    private creator: Keypair
    private readonly splTokenProgram: PublicKey

    constructor(creator: Keypair, splTokenProgram = TOKEN_2022_PROGRAM_ID) {
        this.creator = creator
        this.splTokenProgram = splTokenProgram
    }

    createNFTIx(mint: PublicKey, name: string, symbol: string, uri: string, options?: {
        collection?: PublicKey,
        printSupply?: "Unlimited" | "Zero" | number,
        decimals?: number, // 0 is NFT, > 0 is TOKEN
    }) {
        let printSupply: COption<PrintSupply>;
        if (typeof options?.printSupply === "number") {
            printSupply = {__kind: "Limited", fields: [options.printSupply]};
        } else {
            printSupply = {__kind: options?.printSupply ?? "Zero"};
        }
        return createCreateInstruction(
            {
                metadata: NFTx.getMetadataAccount(mint),
                mint: mint,
                masterEdition: this.getMasterEditionAccount(mint),
                authority: this.creator.publicKey,
                payer: this.creator.publicKey,
                updateAuthority: this.creator.publicKey,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                splTokenProgram: this.splTokenProgram,
            }, {
                createArgs: {
                    __kind: "V1",
                    assetData: {
                        name: name,
                        symbol: symbol,
                        uri: uri,
                        sellerFeeBasisPoints: 0,
                        creators: [{
                            address: this.creator.publicKey,
                            verified: true,
                            share: 100
                        }],
                        primarySaleHappened: false,
                        isMutable: true,
                        tokenStandard: options?.decimals && options.decimals > 0 ? TokenStandard.Fungible : TokenStandard.NonFungible,
                        collection: options?.collection ? {verified: false, key: options.collection} : null,
                        uses: null,
                        collectionDetails: null,
                        ruleSet: null,
                    },
                    decimals: options?.decimals ?? 0,
                    printSupply: printSupply
                }
            }
        )
    }

    createMintIx(mint: PublicKey, to: PublicKey, amount = 1n) {
        return createMintInstruction(
            {
                token: this.getAssociatedTokenAddress(mint, to),
                tokenOwner: this.creator.publicKey,
                metadata: NFTx.getMetadataAccount(mint),
                masterEdition: this.getMasterEditionAccount(mint),
                tokenRecord: undefined,
                mint: mint,
                authority: this.creator.publicKey,
                delegateRecord: undefined,
                payer: this.creator.publicKey,
                systemProgram: SystemProgram.programId,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                splTokenProgram: this.splTokenProgram,
                splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                authorizationRulesProgram: undefined,
                authorizationRules: undefined,
            },
            {
                mintArgs: {
                    __kind: "V1",
                    amount: amount,
                    authorizationData: null,
                }
            }
        )
    }


    // The metadata of edition NFT is immutable
    createPrintIx(mint: PublicKey, newMint: PublicKey, newEditionNumber: number, to: PublicKey) {
        return createPrintInstruction(
            {
                editionMetadata: NFTx.getMetadataAccount(newMint),
                edition: this.getMasterEditionAccount(newMint),
                editionMint: newMint,
                editionTokenAccountOwner: to,
                editionTokenAccount: this.getAssociatedTokenAddress(newMint, to),
                editionMintAuthority: this.creator.publicKey,
                editionTokenRecord: undefined,
                masterEdition: this.getMasterEditionAccount(mint),
                editionMarkerPda: this.getEditionMarkerPda(mint, newEditionNumber),
                payer: this.creator.publicKey,
                masterTokenAccountOwner: this.creator.publicKey,
                masterTokenAccount: this.getAssociatedTokenAddress(mint, this.creator.publicKey),
                masterMetadata: NFTx.getMetadataAccount(mint),
                updateAuthority: this.creator.publicKey,
                splTokenProgram: this.splTokenProgram,
                splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
                systemProgram: SystemProgram.programId,
            },
            {
                printArgs: {
                    __kind: "V1",
                    edition: newEditionNumber
                }
            }
        );
    }

    getAssociatedTokenAddress(mint: PublicKey, to: PublicKey) {
        return getAssociatedTokenAddressSync(
            mint,
            to,
            true,
            this.splTokenProgram,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
    }


    // MetadataV1
   static getMetadataAccount(mint: PublicKey) {
        const [metadata] = PublicKey.findProgramAddressSync([
            Buffer.from('metadata', 'utf8'),
            PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ], PROGRAM_ID);
        return metadata
    }

    getEditionMarkerPda(masterMint: PublicKey, masterEditionNumber: number) {
        const [editionMarkerPda] = PublicKey.findProgramAddressSync([
            Buffer.from('metadata', 'utf8'),
            PROGRAM_ID.toBuffer(),
            masterMint.toBuffer(),
            Buffer.from('edition', 'utf8'),
            Buffer.from((BigInt(masterEditionNumber) / 248n).toString()),
        ], PROGRAM_ID);
        return editionMarkerPda
    }

    // MasterEditionV2
    getMasterEditionAccount(mint: PublicKey) {
        const [master_edition] = PublicKey.findProgramAddressSync([
            Buffer.from('metadata', 'utf8'),
            PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
            Buffer.from('edition', 'utf8'),
        ], PROGRAM_ID);
        return master_edition
    }

    // MasterEditionV2
    getMasterEditionAccountInfo = async (connection: Connection, mint: PublicKey) => {
        return await MasterEditionV2.fromAccountAddress(connection, this.getMasterEditionAccount(mint))
    }

    getMetadataAccountInfo = async (connection: Connection, mint: PublicKey) => {
        return await Metadata.fromAccountAddress(connection, NFTx.getMetadataAccount(mint))
    }

    createVerifyCreator = (mint: PublicKey) => {
        return createVerifyInstruction(
            {
                authority: this.creator.publicKey,
                delegateRecord: undefined,
                metadata: NFTx.getMetadataAccount(mint),
                collectionMint: undefined,
                collectionMetadata: undefined,
                collectionMasterEdition: undefined,
                systemProgram: SystemProgram.programId,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            }, {
                verificationArgs: VerificationArgs.CreatorV1
            }
        )
    }

    createVerifyCollection = (mint: PublicKey) => {
        return createVerifyInstruction(
            {
                authority: this.creator.publicKey,
                delegateRecord: undefined,
                metadata: NFTx.getMetadataAccount(mint),
                collectionMint: mint,
                collectionMetadata: NFTx.getMetadataAccount(mint),
                collectionMasterEdition: this.getMasterEditionAccount(mint),
                systemProgram: SystemProgram.programId,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            }, {
                verificationArgs: VerificationArgs.CollectionV1
            }
        )
    }
}
