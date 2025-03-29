import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    unpackAccount,
    unpackMint
} from "@solana/spl-token";
import {
    AddressLookupTableAccount,
    ComputeBudgetProgram,
    ConfirmedSignatureInfo,
    Connection,
    Keypair,
    PublicKey,
    RpcResponseAndContext,
    SignatureResult,
    SimulatedTransactionResponse,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    Commitment,
    GetAccountInfoConfig,
    ParsedInstruction,
    AccountInfo,
    ParsedAccountData,
    ParsedTransactionWithMeta,
    ParsedAccountsModeBlockResponse
} from "@solana/web3.js";
import {
    TransferTransactionData,
    TokenTransferParsed,
    TokenAccountParsed,
    TransferParsed,
    TokenAccountInfo,
} from "../types/transfer";
import {sleep} from "./sleep";

export const CONFIG = {
    RETRY_SEC: 0.5,
    QUICK_RETRY_SEC: 0.1, // getRecentBlockhash / Blockhash not found
};

// Was getSimulationUnits
// https://github.com/solana-developers/helpers/blob/7bfb9f6f77c04877764f373116ccdc14bf214b71/src/index.ts#L330
export async function getSimulationComputeUnits(
    connection: Connection,
    instructions: Array<TransactionInstruction>,
    payer: PublicKey,
    lookupTables: Array<AddressLookupTableAccount> = [],
): Promise<number | null> {
    const testInstructions = [
        // Set an arbitrarily high number in simulation
        // so we can be sure the transaction will succeed
        // and get the real compute units used
        ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000}),
        ...instructions,
    ];

    const testTransaction = new VersionedTransaction(
        new TransactionMessage({
            instructions: testInstructions,
            payerKey: payer,
            // RecentBlockhash can by any public key during simulation
            // since 'replaceRecentBlockhash' is set to 'true' below
            recentBlockhash: PublicKey.default.toString(),
        }).compileToV0Message(lookupTables),
    );

    const rpcResponse = await connection.simulateTransaction(testTransaction, {
        replaceRecentBlockhash: true,
        sigVerify: false,
    });

    getErrorFromRPCResponse(rpcResponse);
    return rpcResponse.value.unitsConsumed || null;
}

const getErrorFromRPCResponse = (
    rpcResponse: RpcResponseAndContext<
        SignatureResult | SimulatedTransactionResponse
    >,
) => {
    // Note: `confirmTransaction` does not throw an error if the confirmation does not succeed,
    // but rather a `TransactionError` object. so we handle that here
    // See https://solana-labs.github.io/solana-web3.js/classes/Connection.html#confirmTransaction.confirmTransaction-1

    const error = rpcResponse.value.err;
    if (error) {
        // Can be a string or an object (literally just {}, no further typing is provided by the library)
        // https://github.com/solana-labs/solana-web3.js/blob/4436ba5189548fc3444a9f6efb51098272926945/packages/library-legacy/src/connection.ts#L2930
        // TODO: if still occurs in web3.js 2 (unlikely), fix it.
        if (typeof error === "object") {
            const errorKeys = Object.keys(error);
            if (errorKeys.length === 1) {
                if (errorKeys[0] !== "InstructionError") {
                    throw new Error(`Unknown RPC error: ${error}`);
                }
                // @ts-ignore due to missing typing information mentioned above.
                const instructionError = error["InstructionError"];
                // An instruction error is a custom program error and looks like:
                // [
                //   1,
                //   {
                //     "Custom": 1
                //   }
                // ]
                // See also https://solana.stackexchange.com/a/931/294
                throw new Error(
                    `Error in transaction: instruction index ${
                        instructionError[0]
                    }, custom program error ${instructionError[1]["Custom"]}`,
                );
            }
        }
        throw Error(error.toString());
    }
};

export async function mustGetParsedTransactions(
    connection: Connection,
    signatures: string[]
): Promise<ParsedTransactionWithMeta[]> {
    while (true) {
        try {
            const txs = await connection.getParsedTransactions(signatures, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });
            if (!txs.some((tx) => !tx)) {
                return txs as unknown as ParsedTransactionWithMeta[];
            }
        } catch (e) {
            console.log(`[WARN] mustGetParsedTransactions: ${e}`);
        }
        await sleep(CONFIG.RETRY_SEC);
    }
}

// 1- The `start` is not include
// 2- The returned array is from end to start, like [end, ..., start) or []
export async function getSignatures(
    connection: Connection,
    target: PublicKey,
    start: string,
    includeErrTx?: boolean,
) {
    const limit = 1000;

    async function _getSignatures(
        end?: string,
    ): Promise<ConfirmedSignatureInfo[]> {
        let signatures: ConfirmedSignatureInfo[];
        while (true) {
            try {
                signatures = await connection.getSignaturesForAddress(target, {
                    limit: limit,
                    until: start, // stop  position  (not include)
                    before: end, // start position  (not include)
                }, "confirmed");
                if (signatures.length === 0) return [];
                break;
            } catch (e) {
                console.log(`[WARN] getSignatures: ${e}`);
                await sleep(CONFIG.RETRY_SEC)
            }
        }

        if (signatures.length === limit) {
            return [
                ...signatures,
                ...await _getSignatures(signatures[signatures.length-1].signature),
            ];
        }

        return signatures;
    }

    const signatures = await _getSignatures();
    return includeErrTx ? signatures : signatures.filter((s) => !s.err);
}

export async function getRecentBlockhash(connection: Connection) {
    while (true) {
        try {
            const blockhash = await connection.getLatestBlockhash();
            return blockhash.blockhash;
        } catch (e) {
            console.log(`[WARN] getRecentBlockhash: ${e}`);
            await sleep(CONFIG.QUICK_RETRY_SEC);
        }
    }
}

export async function sendInstructions(
    connection: Connection,
    ixs: TransactionInstruction[],
    signers: Keypair[],
    maxExecErrorRetry: number = 1,
    commitment?: "processed" | "confirmed" | "finalized",
    skipPreflight = true,
) {
    const recentSignedTransaction = async () => {
        const transaction = new Transaction();
        transaction.add(...ixs);
        transaction.feePayer = signers[0].publicKey;
        transaction.recentBlockhash = await getRecentBlockhash(connection);
        transaction.sign(...signers);
        return transaction;
    };
    return sendTransaction(
        connection,
        recentSignedTransaction,
        maxExecErrorRetry,
        commitment,
        skipPreflight
    );
}

export async function sendInstructionsV0(
    connection: Connection,
    ixs: TransactionInstruction[],
    addressLookupTableAccounts: AddressLookupTableAccount[],
    signers: Keypair[],
    maxExecErrorRetry: number = 1,
    commitment?: "processed" | "confirmed" | "finalized",
    skipPreflight = true,
) {
    const recentSignedTransaction = async () => {
        const messageV0 = new TransactionMessage({
            payerKey: signers[0].publicKey,
            recentBlockhash: await getRecentBlockhash(connection),
            instructions: ixs,
        }).compileToV0Message(addressLookupTableAccounts);
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign(signers);
        return transaction;
    };
    return sendTransaction(
        connection,
        recentSignedTransaction,
        maxExecErrorRetry,
        commitment,
        skipPreflight
    );
}

export async function sendTransaction(
    connection: Connection,
    recentSignedTransaction: () => Promise<Transaction | VersionedTransaction>,
    maxExecErrorRetry: number = 1,
    commitment?: "processed" | "confirmed" | "finalized",
    skipPreflight = true,
) {
    for (let i = 0; i < maxExecErrorRetry;) {
        try {
            const transaction = await recentSignedTransaction();
            const signature = await connection.sendRawTransaction(
                transaction.serialize(),
                {skipPreflight: skipPreflight},
            );
            console.log(`TX = ${signature}`);
            if (commitment) {
                await connection.confirmTransaction({signature} as any, commitment);
            }
            return signature;
        } catch (e: any) {
            const msg = `${e}`;
            if (msg.indexOf("Blockhash not found") !== -1) {
                console.log(`[WARN] sendTransactionInstructions: ${msg}`);
                await sleep(CONFIG.QUICK_RETRY_SEC);
            } else if (msg.indexOf("Retrying") !== -1) {
                console.log(`[WARN] sendTransactionInstructions: ${msg}`);
                await sleep(CONFIG.RETRY_SEC);
            } else if (msg.indexOf("Unable to perform request")) {
                console.log(`[WARN] sendTransactionInstructions: ${msg}`);
                await sleep(CONFIG.RETRY_SEC);
            } else {
                // UNEXPECTED ERROR!!!
                console.log(`[ERROR] sendTransactionInstructions: ${msg}`);
                if (i++ < maxExecErrorRetry) {
                    await sleep(CONFIG.RETRY_SEC);
                }
            }
        }
    }
}

export async function getPriorityFee(connection: Connection) {
    while (true) {
        try {
            let prioritizationFees = await connection.getRecentPrioritizationFees();
            let length = prioritizationFees.length;
            let prioritizationZeros = 0, prioritizationTotal = 0;
            for (let i = 0; i < length; i++) {
                if (prioritizationFees[i].prioritizationFee === 0) {
                    prioritizationZeros++;
                } else {
                    prioritizationTotal += prioritizationFees[i].prioritizationFee;
                }
            }
            if (prioritizationZeros >= length / 3) {
                return 0;
            }
            return Math.ceil(
                prioritizationTotal / (length - prioritizationZeros) * 1.05,
            );
        } catch (e) {
            console.log(`[WARNING] ${getPriorityFee.name}: ${e}`);
            await sleep(CONFIG.RETRY_SEC);
        }
    }
}

export async function isExistAccount(
    connection: Connection,
    address: PublicKey,
    commitmentOrConfig?: Commitment | GetAccountInfoConfig,
) {
    while (true) {
        try {
            const info = await connection.getAccountInfo(address, commitmentOrConfig);
            return !!info?.lamports;
        } catch (e) {
            console.log(`[WARNING] ${isExistAccount.name}: ${e}`);
            await sleep(CONFIG.RETRY_SEC);
        }
    }
}

export async function createTokenTransferInstructions(
    connection: Connection,
    mint: PublicKey, // token
    from: PublicKey,
    to: PublicKey,
    amount: number | bigint,
    isDelegated = false, // Is `to` delegated by `from`? (default: false). if true, `to` is payer and receiver
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    AssociatedTokenProgram: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
) {
    const associatedFrom = await getAssociatedTokenAddress(
        mint,
        from,
        true,
        tokenProgram,
        AssociatedTokenProgram,
    );
    const associatedTo = await getAssociatedTokenAddress(
        mint,
        to,
        true,
        tokenProgram,
        AssociatedTokenProgram,
    );
    const transfer = createTransferInstruction(
        associatedFrom,
        associatedTo,
        isDelegated ? to : from, // if delegated, use `to`
        amount,
        undefined,
        tokenProgram,
    );
    const isExist = await isExistAccount(connection, associatedTo);
    if (isExist) {
        return [transfer];
    }

    const create = createAssociatedTokenAccountInstruction(
        isDelegated ? to : from, // `to` is payer
        associatedTo,
        to,
        mint,
        tokenProgram,
        AssociatedTokenProgram,
    );
    return [create, transfer];
}

// only the accounts are all existing!
export async function mustGetMultipleParsedAccounts(
    connection: Connection,
    publicKeys: PublicKey[],
) {
    while (true) {
        try {
            const accounts = await connection.getMultipleParsedAccounts(
                publicKeys,
                {commitment: "confirmed"},
            );
            if (accounts.value.some((a) => !a)) {
                continue;
            }
            return accounts;
        } catch (e) {
            console.log(mustGetMultipleParsedAccounts.name, e);
            await sleep(CONFIG.RETRY_SEC);
        }
    }
}

export async function parseTransfersBySignatures(
    connection: Connection,
    signatures: ({ signature: string } | string)[],
    options: {
        filterTokenTransfer?: (info: TokenTransferParsed["info"]) => boolean
        filterTransfer?: (info: TransferParsed["info"]) => boolean
    } = {}
) {

    const transactions = await mustGetParsedTransactions(connection, signatures.map((s: {
        signature: string
    } | string) => (typeof s === "string" ? s : s.signature)));

    return parseTransfers(connection, transactions, options)
}

export async function parseTransfers(
    connection: Connection,
    transactions: ParsedTransactionWithMeta[] | ParsedAccountsModeBlockResponse["transactions"],
    options: {
        filterTokenTransfer?: (info: TokenTransferParsed["info"]) => boolean
        filterTransfer?: (info: TransferParsed["info"]) => boolean
    } = {}
) {
    const list: TransferTransactionData[] = [];
    for (let i = 0; i < transactions.length; i++) {
        const signature = transactions[i].transaction.signatures[0];
        const transaction = transactions[i] as ParsedTransactionWithMeta;
        const instructions = transaction?.transaction?.message?.instructions as ParsedInstruction[];
        if (instructions) {
            const proms = []
            for (let j = 0; j < instructions.length; j++) {
                const instruction = instructions[j];
                switch (instruction.program) {
                    case "spl-token": {
                        if (instruction.parsed?.type === "transfer"
                            || instruction.parsed?.type === "transferChecked") {
                            proms.push(parseTokenTransferDataIfValid(
                                connection,
                                instruction,
                                signature,
                                j,
                                transaction,
                                options.filterTokenTransfer
                            ))
                        }
                        break;
                    }
                    case "system": {
                        const data = parseTransferDataIfValid(
                            instruction,
                            signature,
                            j,
                            transaction,
                            options.filterTransfer
                        );
                        if (data) list.push(data);
                        break;
                    }
                }
            }
            const txs = (await Promise.all(proms)).filter((d) => d) as TransferTransactionData[];
            list.push(...txs)
        }
    }
    return list;
}

async function parseTokenTransferDataIfValid(
    connection: Connection,
    instruction: ParsedInstruction,
    signature: string,
    index: number,
    tx: ParsedTransactionWithMeta,
    filterTokenTransfer: (info: TokenTransferParsed["info"]) => boolean = () => true
) {
    const {info} = instruction.parsed as TokenTransferParsed;
    const amount = info.amount ?? info?.tokenAmount?.amount ?? "0";
    if (Number(amount) > 0 && filterTokenTransfer(info)) {
        const publicKeys = [
            new PublicKey(info.source),
            new PublicKey(info.destination),
        ];
        const accountsContext = await mustGetMultipleParsedAccounts(
            connection,
            publicKeys,
        );
        const accounts = accountsContext.value as AccountInfo<ParsedAccountData>[];
        const {info: acc0} = accounts[0].data.parsed as TokenAccountParsed;
        const {info: acc1} = accounts[1].data.parsed as TokenAccountParsed;
        const data: TransferTransactionData = {
            chain: "solana",
            token: acc0.mint,
            from_wallet: acc0.owner,
            to_wallet: acc1.owner,
            hash: signature,
            index: index,
            amount: amount,
            extra: {
                program: instruction.program,
                program_id: instruction.programId.toBase58(),
                authority: info.authority,
                associated_from: info.source,
                associated_to: info.destination,
                type: instruction.parsed.type,
            },
            error: !!tx.meta?.err,
            fee: tx.meta?.fee ? String(tx.meta.fee) : "-1",
            version: tx.version?.toString() ?? "",
            processed_at: tx.blockTime,
        };
        return data;
    }
}

function parseTransferDataIfValid(
    instruction: ParsedInstruction,
    signature: string,
    index: number,
    tx: ParsedTransactionWithMeta,
    filterTransfer: (info: TransferParsed["info"]) => boolean = () => true
) {
    const {info} = instruction.parsed as TransferParsed;
    if (info.lamports > 0 && filterTransfer(info)) {
        const data: TransferTransactionData = {
            chain: "solana",
            token: "",
            from_wallet: info.source,
            to_wallet: info.destination,
            hash: signature,
            index: index,
            amount: String(info.lamports),
            extra: {
                program: instruction.program,
                program_id: instruction.programId.toBase58(),
                authority: ((info as any)?.authority ?? ""),
                type: instruction.parsed.type,
            },
            error: !!tx.meta?.err,
            fee: tx.meta?.fee ? String(tx.meta.fee) : "-1",
            version: tx.version?.toString() ?? "",
            processed_at: tx.blockTime,
        };
        return data;
    }
}

export async function getTokenAccountInfos(connection: Connection, accounts: PublicKey[]) {
    while (true) {
        try {
            const infos = await connection.getMultipleAccountsInfo(accounts);
            return infos.map((info, i) => {
                if (info) {
                    return unpackAccount(accounts[i], info)
                }
                return undefined
            })
        } catch (e) {
            console.log(`[WARNING] ${getTokenAccountInfos.name}: ${e}`);
            await sleep(CONFIG.RETRY_SEC);
        }
    }
}

export async function getTokenInfos(connection: Connection, tokens: PublicKey[]) {
    try {
        const infos = await connection.getMultipleAccountsInfo(tokens);
        return infos.map((info, i) => {
            if (info) {
                try {
                    return unpackMint(tokens[i], info)
                } catch (e) {
                    return undefined
                }
            }
            return undefined
        })
    } catch (e) {
        return undefined
    }
}

export async function getParsedTransactionsFromSlot(connection: Connection, fromSlot: number, isSync?: boolean) {
    let toSlot: number;
    while (true) {
        try {
            toSlot = await connection.getSlot('confirmed');
            if (fromSlot > toSlot) {
                console.log(`[WARN] getParsedTransactionsFromSlot: fromSlot(${fromSlot}) > toSlot(${toSlot}), wait for next slot(${CONFIG.RETRY_SEC * 10}s)...`);
                await sleep(CONFIG.RETRY_SEC * 10)
                continue
            }
            break
        } catch (e) {
            await sleep(CONFIG.RETRY_SEC)
        }
    }

    const transactions: ParsedAccountsModeBlockResponse["transactions"] = []
    if (isSync) {
        for (let i = fromSlot; i <= toSlot; i++) {
            transactions.push(...(await getParsedBlockTransactions(connection, i)))
        }
    } else {
        const proms: Promise<any[]>[] = []
        for (let i = fromSlot; i <= toSlot; i++) {
            proms.push(getParsedBlockTransactions(connection, i))
        }
        (await Promise.all(proms)).map((txs) => transactions.push(...txs))
    }

    return {transactions, nextSlot: toSlot + 1};
}


export async function getParsedBlockTransactions(connection: Connection, blocknumber: number) {
    while (true) {
        try {
            const block = await connection.getParsedBlock(blocknumber, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            if (block.transactions) {
                block.transactions.forEach((tx) => (tx as any).blockTime = block.blockTime)
                return block.transactions
            }
            return []
        } catch (e) {
            console.log(e)
            await sleep(CONFIG.RETRY_SEC)
        }
    }
}

export async function getProgramAccounts(connection: Connection, wallet: string) {
    const response = await connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
            filters: [
                {dataSize: 165},
                {memcmp: {offset: 32, bytes: wallet}}
            ]
        });
    return response.map(v => unpackAccount(v.pubkey, v.account))
}

export async function getTokenAccountsByOwner(connection: Connection, wallet: string) {
    const response = await connection.getTokenAccountsByOwner(new PublicKey(wallet), {programId: TOKEN_PROGRAM_ID})
    return response.value.map(v => unpackAccount(v.pubkey, v.account))
}

export async function confirmSignature(connection: Connection, signature: string, preWaitSeconds: number = 0.5, maxTry: number = 3, everyWaitSeconds: number = 2.8) {
    await sleep(preWaitSeconds);
    for (let i = 1; i <= maxTry; i++) {
        try {
            const response = await connection.getSignatureStatus(signature, {searchTransactionHistory: true});
            if (response && response.value) {
                if (response.value.err) {
                    return {hash: signature, error: response.value.err};
                }
                const {confirmationStatus} = response.value;
                if (confirmationStatus === "processed") {
                    i--
                } else if (confirmationStatus === "confirmed" || confirmationStatus === "finalized") {
                    return {hash: signature, error: undefined, raw: response.value};
                }
            }
            if (i < maxTry) {
                await sleep(everyWaitSeconds);
            }
        } catch (e) {
            console.log(`[ERROR] Connection::confirmSignature: ${e}`)
            await sleep(CONFIG.RETRY_SEC);
        }
    }
    return {hash: signature, error: "Network error! Transaction not detected!"};
}
