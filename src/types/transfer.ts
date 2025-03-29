export interface TokenAccountParsed {
    info: TokenAccountInfo;
    type: string;
}

export interface TokenTransferParsed {
    info: HashTokenTransferInfo & BlockTokenTransferInfo
    type: string;
}

export interface TransferParsed {
    info: TransferInfo;
    type: string;
}

export interface TransferTransactionDataExtra extends TransferTransactionData {
    user_id?: string;
    type: "platform->user" | "platform<-user";
}

export interface TransferTransactionData {
    // user_id: string;
    from_wallet: string;
    to_wallet: string;
    // type: "platform->user" | "user->platform";
    chain: string;
    token: string;
    amount: string;
    fee: string;
    version: string;
    hash: string;
    index: number;
    processed_at?: number | null;
    error?: boolean;
    extra?: {
        program: string;
        program_id: string;
        authority?: string;
        associated_from?: string;
        associated_to?: string;
        platform?: string;
        type: string;
    };
}

interface Amount {
    amount: string;
    decimals: number;
    uiAmount: number;
    uiAmountString: string;
}


export interface TokenAccountInfo {
    delegate?: string;
    delegatedAmount?: Amount;
    isNative: boolean;
    mint: string;
    owner: string;
    state: string;
    tokenAmount: Amount;
}

interface TransferInfo {
    source: string;
    destination: string;
    lamports: number;
}

 interface BlockTokenTransferInfo {
    authority: string;
    source: string;
    destination: string;
    tokenAmount?: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string
    };
    mint?: string;
}

 interface HashTokenTransferInfo {
    authority: string;
    source: string;
    destination: string;
    amount?: string;
}
