import {TransactionInstruction, PublicKey, AddressLookupTableAccount, Connection} from "@solana/web3.js";
import {sleep} from "../utils/sleep";
import {DefaultApi, Instruction, type SwapInstructionsResponse} from "./generated";
import {ConfigurationParameters, Configuration} from "./generated";

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
        data: Buffer.from(instruction.data, "base64"),
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
