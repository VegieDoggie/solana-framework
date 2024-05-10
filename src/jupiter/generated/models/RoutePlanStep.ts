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

import type {SwapInfo} from './SwapInfo';
import {SwapInfoFromJSON, SwapInfoToJSON,} from './SwapInfo';

/**
 *
 * @export
 * @interface RoutePlanStep
 */
export interface RoutePlanStep {
    /**
     *
     * @type {SwapInfo}
     * @memberof RoutePlanStep
     */
    swapInfo: SwapInfo;
    /**
     *
     * @type {number}
     * @memberof RoutePlanStep
     */
    percent: number;
}

/**
 * Check if a given object implements the RoutePlanStep interface.
 */
export function instanceOfRoutePlanStep(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "swapInfo" in value;
    isInstance = isInstance && "percent" in value;

    return isInstance;
}

export function RoutePlanStepFromJSON(json: any): RoutePlanStep {
    return RoutePlanStepFromJSONTyped(json, false);
}

export function RoutePlanStepFromJSONTyped(json: any, _ignoreDiscriminator: boolean): RoutePlanStep {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {

        'swapInfo': SwapInfoFromJSON(json['swapInfo']),
        'percent': json['percent'],
    };
}

export function RoutePlanStepToJSON(value?: RoutePlanStep | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {

        'swapInfo': SwapInfoToJSON(value.swapInfo),
        'percent': value.percent,
    };
}

