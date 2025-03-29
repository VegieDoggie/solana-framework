export const bigIntReplacer = (_: string, value: any) => {
    return typeof value === 'bigint' ? value.toString() : value;
}
