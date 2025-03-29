type Object = { [prop: string]: any }

export class Retry {
    static DEFAULT_MAX_ERROR_LIMIT = 5
    static DEFAULT_TIMEOUT_MS = 200

    static withMerge<T extends Object>(targets: T[], maxErrorCount: number = Retry.DEFAULT_MAX_ERROR_LIMIT, everyErrorWaitMS: number = Retry.DEFAULT_TIMEOUT_MS) {
        if (targets.length === 0) {
            throw new Error(`[Retry.withMerge] [ERROR] targets must > 0`)
        }
        if (targets.some(proxy => !proxy)) {
            throw new Error("[Retry.withMerge] [ERROR] targets has none!")
        }
        return new Proxy(targets[0], {
            get(_: any, name: string): any {
                let target = targets.find(proxy => name in proxy)
                if (target === undefined) return undefined;
                if (typeof target[name] === 'function') {
                    const func = target[name].bind(target);
                    return function (...args: any[]): any {
                        let result = func(...args);
                        if (Retry.isPromise(result)) {
                            let count = 0;
                            const attempt = async (param?: Promise<any>): Promise<any> => {
                                try {
                                    return await (param ?? func(...args) as Promise<any>);
                                } catch (e) {
                                    if (count++ < maxErrorCount) {
                                        console.log(`[Proxy] [ERROR] ${name}() => ${e}`);
                                        await new Promise(resolve => setTimeout(resolve, everyErrorWaitMS));
                                        return attempt();
                                    } else {
                                        throw e;
                                    }
                                }
                            }
                            return attempt(result)
                        }
                        return result;
                    }
                }
                return target[name]
            },

        }) as T & Object;
    }

    static withIterator<T extends Object>(targets: T[], maxErrorCount: number = Retry.DEFAULT_MAX_ERROR_LIMIT, everyErrorWaitMS: number = Retry.DEFAULT_TIMEOUT_MS) {
        if (targets.length === 0) {
            throw new Error("targets must > 0")
        }
        if (targets.some(proxy => !proxy)) {
            throw new Error("targets has none!")
        }
        const baseTarget = targets[0];
        let index = 0
        return new Proxy(baseTarget, {
            get(_: any, name: string): any {
                if (typeof baseTarget[name] === 'function') {
                    return function (...args: any[]): any {
                        const result = targets[index++ % targets.length][name](...args);
                        if (Retry.isPromise(result)) {
                            let count = 0;
                            const attempt = async (param?: Promise<any>): Promise<any> => {
                                try {
                                    return await (param ?? targets[index++ % targets.length][name](...args) as Promise<any>);
                                } catch (e) {
                                    if (count++ < maxErrorCount) {
                                        console.log(`[Retry.iterate] [ERROR] ${name}() => ${e}`);
                                        await new Promise(resolve => setTimeout(resolve, everyErrorWaitMS));
                                        return attempt();
                                    } else {
                                        throw e;
                                    }
                                }
                            }
                            return attempt(result)
                        }
                        return result;
                    }
                }
                return baseTarget[name]
            },
        }) as T;
    }

    private static isPromise = (value: any) => {
        return value && typeof value.then === 'function' && typeof value.catch === 'function';
    }

    private static bigintReplacer = (_: any, value: any) => {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    }
}
