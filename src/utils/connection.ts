// deno-lint-ignore-file
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "../adapter/spl-token.ts";
import {
  AccountInfo,
  AddressLookupTableAccount,
  Commitment,
  ComputeBudgetProgram,
  ConfirmedSignatureInfo,
  Connection,
  GetAccountInfoConfig,
  Keypair,
  ParsedAccountData,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PublicKey,
  RpcResponseAndContext,
  SignatureResult,
  SimulatedTransactionResponse,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "../adapter/web3.ts";
import {
  TokenAccountParsed,
  TokenTransferParsed,
  TransferParsed,
  TransferTransactionData,
} from "../types/transfer.ts";
import { sleep } from "./sleep.ts";

// Was getSimulationUnits
// https://github.com/solana-developers/helpers/blob/7bfb9f6f77c04877764f373116ccdc14bf214b71/src/index.ts#L330
export const getSimulationComputeUnits = async (
  connection: Connection,
  instructions: Array<TransactionInstruction>,
  payer: PublicKey,
  lookupTables: Array<AddressLookupTableAccount> = [],
): Promise<number | null> => {
  const testInstructions = [
    // Set an arbitrarily high number in simulation
    // so we can be sure the transaction will succeed
    // and get the real compute units used
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
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
};

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
  signatures: string[],
  retrySec: number = 0.5,
) {
  while (true) {
    try {
      const txs = await connection.getParsedTransactions(signatures, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!txs.some((tx) => !tx)) {
        return txs;
      }
    } catch {
    }
    await sleep(retrySec);
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
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (signatures.length === limit) {
      return [
        ...signatures,
        ...await _getSignatures(signatures.at(-1)!.signature),
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
      await sleep(0.1);
    }
  }
}

export async function sendInstructions(
  connection: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  maxExecErrorRetry: number = 1,
  commitment?: "processed" | "confirmed" | "finalized",
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
  );
}

// const connection = new Connection(clusterApiUrl("mainnet-beta"));
// const wallet = initializeKeypair("PRIVATE_KEY");
// const jupiter = createJupiterApiClient();
// const quote = await jupiter.quoteGet({
//     inputMint: "So11111111111111111111111111111111111111112",
//     outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//     amount: 1000000,
// });
// const instructionsResponse = await jupiter.swapInstructionsPost({
//     swapRequest: {
//         quoteResponse: quote,
//         userPublicKey: wallet.publicKey.toBase58(),
//     }
// })
// const instructions = parseSwapInstructions(instructionsResponse);
// const addressLookupTableAddresses = await parseAddressLookupTableAccounts(connection, instructionsResponse.addressLookupTableAddresses);
// const sig = await sendInstructionsV0(connection, instructions, addressLookupTableAddresses, [wallet], 10)
// console.log(sig)
export async function sendInstructionsV0(
  connection: Connection,
  ixs: TransactionInstruction[],
  addressLookupTableAccounts: AddressLookupTableAccount[],
  signers: Keypair[],
  maxExecErrorRetry: number = 1,
  commitment?: "processed" | "confirmed" | "finalized",
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
  );
}

export async function sendTransaction(
  connection: Connection,
  recentSignedTransaction: () => Promise<Transaction | VersionedTransaction>,
  maxExecErrorRetry: number = 1,
  commitment?: "processed" | "confirmed" | "finalized",
) {
  for (let i = 0; i < maxExecErrorRetry;) {
    try {
      const transaction = await recentSignedTransaction();
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: true },
      );
      console.log(`TX = ${signature}`);
      if (commitment) {
        await connection.confirmTransaction({ signature } as any, commitment);
      }
      return signature;
    } catch (e: any) {
      const msg = `${e}`;
      if (msg.indexOf("Blockhash not found") !== -1) {
        await sleep(0.1);
      } else if (msg.indexOf("Retrying") !== -1) {
        await sleep(1);
      } else {
        // UNEXPECTED ERROR!!!
        console.log(`[ERROR] sendTransactionInstructions: ${msg}`);
        i++;
        await sleep(0.2);
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
      await sleep(0.5);
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
      await sleep(0.5);
    }
  }
}

export async function createTokenTransferInstructions(
  connection: Connection,
  mint: PublicKey, // token
  from: PublicKey,
  to: PublicKey,
  amount: number,
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
        { commitment: "confirmed" },
      );
      if (accounts.value.some((a) => !a)) {
        continue;
      }
      return accounts;
    } catch (e) {
      console.log(mustGetMultipleParsedAccounts.name, e);
      await sleep(0.2);
    }
  }
}

export async function parseTransactions(
  connection: Connection,
  signaturesInfos: ConfirmedSignatureInfo[],
) {
  const list: TransferTransactionData[] = [];
  const signatures = signaturesInfos.map((s) => s.signature);
  const transactions = await mustGetParsedTransactions(connection, signatures);
  for (let i = 0; i < transactions.length; i++) {
    const signature = signatures[i];
    const transaction = transactions[i]!;
    const instructions = transaction.transaction.message
      .instructions as ParsedInstruction[];
    for (let j = 0; j < instructions.length; j++) {
      const instruction = instructions[j];
      if (instruction.parsed?.type === "transfer") {
        switch (instruction.program) {
          case "spl-token": {
            const data = await parseTokenTransferData(
              connection,
              instruction,
              signature,
              j,
              transaction,
            );
            if (data) list.push(data);
            break;
          }
          case "system": {
            const data = parseTransferData(
              instruction,
              signature,
              j,
              transaction,
            );
            if (data) list.push(data);
            break;
          }
          default:
            console.log(
              "Unsupported-Transfer",
              signature,
              instruction.program,
              instruction.parsed,
            );
        }
      }
    }
  }
  return list;
}

async function parseTokenTransferData(
  connection: Connection,
  instruction: ParsedInstruction,
  signature: string,
  index: number,
  tx: ParsedTransactionWithMeta,
) {
  const { info } = instruction.parsed as TokenTransferParsed;
  if (Number(info.amount) > 0) {
    const publicKeys = [
      new PublicKey(info.source),
      new PublicKey(info.destination),
    ];
    const accountsContext = await mustGetMultipleParsedAccounts(
      connection,
      publicKeys,
    );
    const accounts = accountsContext.value as AccountInfo<ParsedAccountData>[];
    const { info: acc0 } = accounts[0].data.parsed as TokenAccountParsed;
    const { info: acc1 } = accounts[1].data.parsed as TokenAccountParsed;
    const data: TransferTransactionData = {
      chain: "solana",
      token: acc0.mint,
      from_wallet: acc0.owner,
      to_wallet: acc1.owner,
      hash: signature,
      index: index,
      amount: info.amount,
      extra: {
        program: instruction.program,
        program_id: instruction.programId.toBase58(),
        authority: info.authority,
        associated_from: info.source,
        associated_to: info.destination,
      },
      error: tx.meta?.err ? JSON.stringify(tx.meta.err) : undefined,
      fee: tx.meta?.fee ? String(tx.meta.fee) : "0",
      version: tx.version?.toString() ?? "",
      processed_at: tx.blockTime
        ? new Date(tx.blockTime).toString()
        : undefined,
    };
    return data;
  }
}

function parseTransferData(
  instruction: ParsedInstruction,
  signature: string,
  index: number,
  tx: ParsedTransactionWithMeta,
) {
  const { info } = instruction.parsed as TransferParsed;
  if (info.lamports > 0) {
    const data: TransferTransactionData = {
      chain: "solana",
      token: instruction.programId.toBase58(),
      from_wallet: info.source,
      to_wallet: info.destination,
      hash: signature,
      index: index,
      amount: String(info.lamports),
      extra: {
        program: instruction.program,
        program_id: instruction.programId.toBase58(),
        authority: ((info as any)?.authority ?? ""),
      },
      error: tx.meta?.err ? JSON.stringify(tx.meta.err) : undefined,
      fee: tx.meta?.fee ? String(tx.meta.fee) : "0",
      version: tx.version?.toString() ?? "",
      processed_at: tx.blockTime
        ? new Date(tx.blockTime).toString()
        : undefined,
    };
    return data;
  }
}
