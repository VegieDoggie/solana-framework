/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as web3 from '@solana/web3.js';
import * as beet from '@metaplex-foundation/beet';
import * as beetSolana from '@metaplex-foundation/beet-solana';
/**
 * This type is used to derive the {@link ProgrammableConfig} type as well as the de/serializer.
 * However don't refer to it in your code but use the {@link ProgrammableConfig} type instead.
 *
 * @category userTypes
 * @category enums
 * @category generated
 * @private
 */
export type ProgrammableConfigRecord = {
  V1: { ruleSet: beet.COption<web3.PublicKey> };
};

/**
 * Union type respresenting the ProgrammableConfig data enum defined in Rust.
 *
 * NOTE: that it includes a `__kind` property which allows to narrow types in
 * switch/if statements.
 * Additionally `isProgrammableConfig*` type guards are exposed below to narrow to a specific variant.
 *
 * @category userTypes
 * @category enums
 * @category generated
 */
export type ProgrammableConfig = beet.DataEnumKeyAsKind<ProgrammableConfigRecord>;

export const isProgrammableConfigV1 = (
  x: ProgrammableConfig,
): x is ProgrammableConfig & { __kind: 'V1' } => x.__kind === 'V1';

/**
 * @category userTypes
 * @category generated
 */
export const programmableConfigBeet = beet.dataEnum<ProgrammableConfigRecord>([
  [
    'V1',
    new beet.FixableBeetArgsStruct<ProgrammableConfigRecord['V1']>(
      [['ruleSet', beet.coption(beetSolana.publicKey)]],
      'ProgrammableConfigRecord["V1"]',
    ),
  ],
]) as beet.FixableBeet<ProgrammableConfig, ProgrammableConfig>;
