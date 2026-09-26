import { chromium } from "@playwright/test";
import sparticuz from "@sparticuz/chromium";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
export async function launchBrowser() {
  // The npm-distributed browser lets CI run without an additional browser CDN download.
  const directory = path.join(os.tmpdir(), "apex-browser-libs");
  if (
    process.platform === "linux" &&
    !fs.existsSync(path.join(directory, "lib/libnspr4.so"))
  ) {
    fs.mkdirSync(directory, { recursive: true });
    const archive = path.resolve(
      "node_modules/@sparticuz/chromium/bin/al2023.tar.br",
    );
    if (fs.existsSync(archive)) {
      const tar = path.join(directory, "libs.tar");
      fs.writeFileSync(
        tar,
        zlib.brotliDecompressSync(fs.readFileSync(archive)),
      );
      execFileSync("tar", ["-xf", tar, "-C", directory]);
    }
  }
  return chromium.launch({
    executablePath:
      process.env.CHROME_PATH || (await sparticuz.executablePath()),
    args: [
      ...sparticuz.args,
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${directory}/lib:${process.env.LD_LIBRARY_PATH || ""}`,
    },
    headless: true,
  });
}
