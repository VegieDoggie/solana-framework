// deno-lint-ignore-file
/* tslint:disable */
/* eslint-disable */
/**
 * Jupiter API v6
 * The core of [jup.ag](https://jup.ag). Easily get a quote and swap through Jupiter API.  ### Rate Limit We update our rate limit from time to time depending on the load of our servers. We recommend running your own instance of the API if you want to have high rate limit, here to learn how to run the [self-hosted API](https://station.jup.ag/docs/apis/self-hosted).  ### API Wrapper - Typescript [@jup-ag/api](https://github.com/jup-ag/jupiter-quote-api-node)  ### Data types - Public keys are base58 encoded strings - raw data such as Vec<u8\\> are base64 encoded strings
 *
 * The version of the OpenAPI document: 6.0.0
 *
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import type {JupiterAccountMeta} from './JupiterAccountMeta.ts';
import {AccountMetaFromJSON, AccountMetaToJSON,} from './JupiterAccountMeta.ts';

/**
 *
 * @export
 * @interface Instruction
 */
export interface Instruction {
    /**
     *
     * @type {string}
     * @memberof Instruction
     */
    programId: string;
    /**
     *
     * @type {Array<JupiterAccountMeta>}
     * @memberof Instruction
     */
    accounts: Array<JupiterAccountMeta>;
    /**
     *
     * @type {string}
     * @memberof Instruction
     */
    data: string;
}

/**
 * Check if a given object implements the Instruction interface.
 */
export function instanceOfInstruction(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "programId" in value;
    isInstance = isInstance && "accounts" in value;
    isInstance = isInstance && "data" in value;

    return isInstance;
}

export function InstructionFromJSON(json: any): Instruction {
    return InstructionFromJSONTyped(json, false);
}

export function InstructionFromJSONTyped(json: any, _ignoreDiscriminator: boolean): Instruction {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {

        'programId': json['programId'],
        'accounts': ((json['accounts'] as Array<any>).map(AccountMetaFromJSON)),
        'data': json['data'],
    };
}

export function InstructionToJSON(value?: Instruction | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {

        'programId': value.programId,
        'accounts': ((value.accounts as Array<any>).map(AccountMetaToJSON)),
        'data': value.data,
    };
}

