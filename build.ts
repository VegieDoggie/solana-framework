import {build, emptyDir} from "https://deno.land/x/dnt@0.40.0/mod.ts";

await emptyDir("./npm");

await build({
    entryPoints: ["./mod.ts"],
    outDir: "./npm",
    shims: {
        deno: "dev",
        crypto: true,
        blob: true,
    },
    package: {
        name: "solana-framework",
        version: Deno.args[0],
        description: "solana-framework is a toolkit",
        license: "MIT",
        repository: {
            "type": "git",
            "url": "git+https://github.com/VegieDoggie/solana-framework.git"
        },
        keywords: [
            "solana",
            "instruction",
            "web3.js",
            "keyPair",
            "helper",
            "utils"
        ],
        bugs: {
            "url": "https://https://github.com/VegieDoggie/solana-framework/issues"
        },
        homepage: "https://https://github.com/VegieDoggie/solana-framework#readme",
    },
    postBuild() {
        Deno.copyFileSync("README.md", "npm/README.md");
    },
})

