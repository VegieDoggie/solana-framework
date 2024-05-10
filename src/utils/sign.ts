// deno-lint-ignore-file
import {Keypair} from "../adapter/web3.ts";
import {base58} from "../adapter/bs58.ts";
import {nacl} from "../adapter/tweetnacl.ts";

export function signSolanaWallet(wallet: Keypair, extraInfo: any = {}) {
    const message = JSON.stringify({
        ...extraInfo,
        wallet: wallet.publicKey.toBase58(),
        chain: "solana",
    })
    const coder = new TextEncoder();
    const signature = base58.encode(nacl.sign.detached(coder.encode(message), wallet.secretKey));
    return {message, signature};
}

export function verifySolanaWallet(body: ReturnType<typeof signSolanaWallet>) {
    const {message, signature} = body;
    const coder = new TextEncoder();
    return nacl.sign.detached.verify(
        coder.encode(message),
        base58.decode(signature),
        base58.decode(JSON.parse(message).wallet)
    );
}
