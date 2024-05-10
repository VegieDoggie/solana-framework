import {TransactionInstruction, PublicKey, AddressLookupTableAccount, Connection} from "../adapter/web3.ts";
import {sleep} from "../utils/sleep.ts";
import {DefaultApi, Instruction, type SwapInstructionsResponse} from "./generated/index.ts";
import {ConfigurationParameters, Configuration} from "./generated/index.ts";
import { decode } from "https://deno.land/std@0.140.0/encoding/base64.ts"

export const createJupiterApiClient = (config?: ConfigurationParameters) => {
    return new DefaultApi(new Configuration(config));
};

const deserializeInstruction = (instruction: Instruction) => {
    return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: decode(instruction.data),
    });
};

export const parseAddressLookupTableAccounts = async (
    connection: Connection,
    keys: string[]
): Promise<AddressLookupTableAccount[]> => {
    while (true) {
        try {
            const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
                keys.map((key) => new PublicKey(key))
            );
            return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
                const addressLookupTableAddress = keys[index];
                if (accountInfo) {
                    const addressLookupTableAccount = new AddressLookupTableAccount({
                        key: new PublicKey(addressLookupTableAddress),
                        state: AddressLookupTableAccount.deserialize(accountInfo.data),
                    });
                    acc.push(addressLookupTableAccount);
                }

                return acc;
            }, new Array<AddressLookupTableAccount>());
        } catch (e) {
            await sleep(0.2)
        }
    }
};

export const parseSwapInstructions = (instructions: SwapInstructionsResponse) => {
    const {
        tokenLedgerInstruction,
        computeBudgetInstructions,
        setupInstructions,
        swapInstruction,
        cleanupInstruction,
        // addressLookupTableAddresses,
    } = instructions;

    const ixs = tokenLedgerInstruction ? [tokenLedgerInstruction] : [];
    ixs.push(...computeBudgetInstructions, ...setupInstructions, swapInstruction);
    if (cleanupInstruction) ixs.push(cleanupInstruction);

    return ixs.map(deserializeInstruction);
}
