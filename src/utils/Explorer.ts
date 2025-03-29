import {Cluster} from "@solana/web3.js";

export class Explorer {
    static tx = (id: string = "", cluster?: Cluster | "localnet") => {
        return getExplorerLink("tx", id, cluster)
    }

    static address = (id: string = "", cluster?: Cluster | "localnet") => {
        return getExplorerLink("address", id, cluster)
    }

    static block = (id: string = "", cluster?: Cluster | "localnet") => {
        return getExplorerLink("block", id, cluster)
    }
}

const getExplorerLink = (
    linkType: "transaction" | "tx" | "address" | "block",
    id: string,
    cluster: Cluster | "localnet" = "devnet",
): string => {
    const searchParams: Record<string, string> = {};
    if (cluster !== "mainnet-beta") {
        if (cluster === "localnet") {
            // localnet technically isn't a cluster, so requires special handling
            searchParams["cluster"] = "custom";
            searchParams["customUrl"] = "http://localhost:8899";
        } else {
            searchParams["cluster"] = cluster;
        }
    }
    let baseUrl = "https://explorer.solana.com";
    if (linkType === "address") {
        baseUrl = `${baseUrl}/address/${id}`;
    }
    if (linkType === "transaction" || linkType === "tx") {
        baseUrl = `${baseUrl}/tx/${id}`;
    }
    if (linkType === "block") {
        baseUrl = `${baseUrl}/block/${id}`;
    }
    return encodeURL(baseUrl, searchParams);
};

const encodeURL = (baseUrl: string, searchParams: Record<string, string>) => {
    // This was a little new to me, but it's the
    // recommended way to build URLs with query params
    // (and also means you don't have to do any encoding)
    // https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(searchParams).toString();
    return url.toString();
};
