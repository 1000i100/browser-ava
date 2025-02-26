#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { init, parse } from "es-module-lexer";
import { chromium, firefox, webkit } from "playwright";
import Koa from "koa";
import Static from "koa-static";
import { WebSocketServer } from "ws";
import { program, Option } from "commander";
import { calculateSummary, summaryMessages } from "./browser/util.mjs";
import { resolveImport } from "./resolver.mjs";

const utf8EncodingOptions = { encoding: "utf8" };

const { version, description } = JSON.parse(
  readFileSync(
    new URL("../package.json", import.meta.url).pathname,
    utf8EncodingOptions
  )
);

const knownBrowsers = {
  chromium: chromium,
  firefox: firefox,
  webkit: webkit,
  safari: webkit
};

const browsers = [];
let openBrowsers = [];

Object.entries(knownBrowsers).forEach(([name, browser]) => {
  program.option(`--${name}`, `run tests against ${name} browser`, () =>
    browsers.push(browser)
  );
});

program
  .description(description)
  .version(version)
  .addOption(
    new Option("-p, --port <number>", "server port to use")
      .default(8080)
      .env("PORT")
  )
  .addOption(
    new Option("-b, --browser <name>", "browser to use").env("BROWSER")
  )
  .option("--headless", "hide browser window", false)
  .option(
    "--no-keep-open",
    "keep browser-ava and the page open after execution",
    true
  )
  .argument("<tests...>")
  .action(async (tests, options) => {
    if (options.browser) {
      browsers.push(knownBrowsers[options.browser]);
    }

    if (browsers.length === 0) {
      console.error(
        "No browsers selected use --webkit, --chromium and/or --firefox"
      );
      process.exit(2);
    }

    await init;

    tests = tests.map(file => {
      return { url: resolve(process.cwd(), file), file };
    });

    const { server, wss } = await createServer(tests, options);

    async function shutdown(failed, force) {
      if (!options.keepOpen || force) {
        await Promise.all(openBrowsers.map(browser => browser.close()));
        server.close();
        process.exit(force ? 2 : failed ? 1 : 0);
      }
    }

    let errors = 0;

    wss.on("connection", ws => {
      ws.on("message", async data => {
        data = JSON.parse(data);
        switch (data.action) {
          case "info":
            console.info(...data.data);
            break;
          case "log":
            console.log(...data.data);
            break;
          case "error":
            errors++;
            console.error(...data.data);
            await shutdown(undefined, true);
            break;

          case "ready":
            ws.send(JSON.stringify({ action: "run" }));
            break;
          case "result":
            const summary = calculateSummary(data.data);

            for (const m of summaryMessages(summary)) {
              console.log(m.text);
            }

            await shutdown(summary.failed);
        }
      });

      ws.send(
        JSON.stringify({
          action: "load",
          data: tests
        })
      );
    });

    openBrowsers = await Promise.all(
      browsers.map(async b => {
        const browser = await b.launch({ headless: options.headless });
        const page = await browser.newPage();
        await page.goto(`http://localhost:${options.port}/index.html`);
        return browser;
      })
    );
  });

program.parse(process.argv);


async function loadAndRewriteImports(file) {
  let body = await readFile(file, utf8EncodingOptions);

  const [imports] = parse(body);

  let d = 0;

  for (const i of imports) {
    let m;

    if (i.n === "ava") {
      //  m = new URL("browser/ava.mjs", import.meta.url).pathname;
      m = "/ava.mjs";
    }

    if (!m) {
      m = await resolveImport(i.n, resolve(process.cwd(), file));
    }

    if (m) {
      body = body.substring(0, i.s + d) + m + body.substring(i.e + d);
      d += m.length - i.n.length;
    } else {
      console.warn(`Unable to resolve "${i.n}" may lead to import errors`);
    }
  }

  return body;
}

async function createServer(tests, options) {
  const app = new Koa();

  app.use(Static(new URL("./browser", import.meta.url).pathname));

  app.on("error", console.error);

  app.use(async (ctx, next) => {
    const path = ctx.request.path;

    if (path.endsWith(".mjs") || path.endsWith(".js")) {
      ctx.response.type = "text/javascript";
      ctx.body = await loadAndRewriteImports(path);
      return;
    }

    await next();
  });

  const server = await new Promise((resolve, reject) => {
    const server = app.listen(options.port, error => {
      if (error) {
        reject(error);
      } else {
        resolve(server);
      }
    });
  });

  const wss = new WebSocketServer({ server });

  return {
    server,
    wss
  };
}
