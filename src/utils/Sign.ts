import {Keypair} from "@solana/web3.js";
import base58 from "bs58";
import nacl from "tweetnacl";

export function signSolanaWallet(wallet: Keypair, extraInfo: any = {}) {
    const message = JSON.stringify({
        ...extraInfo,
        wallet: wallet.publicKey.toBase58(),
        chain: "solana",
    })
    const signature = base58.encode(nacl.sign.detached(Buffer.from(message), wallet.secretKey));
    return {message, signature};
}

export function verifySolanaWallet(body: ReturnType<typeof signSolanaWallet>) {
    const {message, signature} = body;
    return nacl.sign.detached.verify(
        Buffer.from(message),
        base58.decode(signature),
        base58.decode(JSON.parse(message).wallet)
    );
}
