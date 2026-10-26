import { parseFlags } from "../lib/args.mjs"
import { download, extract, openPage, savePageCommand } from "./browser/actions.mjs"
import {
  learnAdd,
  learnList,
  learnRemove,
  learnReset,
  learnStats,
  learnTest,
} from "./browser/learn.mjs"
import { recordDelete, recordList, recordShow, recordStart } from "./browser/record.mjs"
import { replay } from "./browser/replay.mjs"
import { sessionLogin, sessionPath, sessionReset, sessionStatus } from "./browser/session.mjs"

const SPEC = {
  "--url": { key: "url" },
  "--html": { key: "html" },
  "--selector": { key: "selector" },
  "--field": { key: "field" },
  "--value": { key: "value" },
  "--page": { key: "page" },
  "--mode": { key: "mode" },
  "--attr": { key: "attr" },
  "--out": { key: "out" },
  "--profile": { key: "profile" },
  "--headed": { key: "headed", type: "boolean" },
  "--json": { key: "json", type: "boolean" },
  "--yes": { key: "yes", type: "boolean" },
  "--id": { key: "id", type: "int" },
  "--name": { key: "name" },
  "--timeout": { key: "timeout", type: "int" },
  "--download-dir": { key: "downloadDir" },
}

export const BROWSER_HELP = `Usage: node src/cli.mjs browser <command> [options]

Commands:
  session status|login|reset|path     persistent isolated session under ~/.mllt/browser
  open --url URL [--headed]           open a page and print a summary
  extract --url URL [--selector CSS]  extract text/html/attributes from a page
          [--field NAME --page KEY]   resolve a learned selector from SQLite
  download --url URL [--out PATH]     download a file (optionally via --selector)
  page --url URL --out DIR            save HTML + MHTML + screenshot + text
  learn add --html FILE --field NAME  learn/teach a selector from saved HTML
        (--value TEXT | --selector CSS) [--page KEY] [--mode text|html|attr]
        (--url URL also works for static HTML; no browser is launched)
  learn list|stats [--page KEY] [--field NAME]
  learn test --html FILE --field NAME
  learn remove --id N
  learn reset [--page KEY] --yes
  record start --name NAME [--url URL]  record browser actions (headed)
  record list|show --name NAME
  record delete --name NAME --yes
  replay --name NAME [--headed] [--download-dir DIR]

Options:
  --profile NAME   Browser profile (default: default)
  --timeout SECS   Timeout in seconds
  --json           JSON output where supported
  -h, --help       Show this help
`

function seconds(value, fallback) {
  return (value ?? fallback) * 1000
}

function fail(warn, error, code = 4) {
  warn(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
  return code
}

export async function browser(argv, { log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(BROWSER_HELP)
    return 0
  }
  const [area, ...afterArea] = argv
  if (!area) {
    warn(BROWSER_HELP)
    return 2
  }
  const subcommand = ["session", "learn", "record"].includes(area)
  const action = subcommand ? afterArea[0] : ""
  const rest = area === "replay" ? afterArea : subcommand ? afterArea.slice(1) : afterArea

  let parsed
  try {
    parsed = parseFlags(rest, SPEC)
  } catch (error) {
    warn(`${error.message}\n\n${BROWSER_HELP}`)
    return 2
  }
  const values = parsed.values
  const profile = values.profile || "default"
  const timeoutMs = seconds(values.timeout, area === "record" || action === "login" ? 900 : 60)

  try {
    if (area === "session") {
      if (action === "status") {
        const { status, output } = await sessionStatus({ profile, json: values.json })
        log(output)
        return 0
      }
      if (action === "login") {
        return await sessionLogin({ profile, url: values.url || "about:blank", timeoutMs, log })
      }
      if (action === "reset") return await sessionReset({ profile, yes: values.yes, log })
      if (action === "path") {
        log(sessionPath())
        return 0
      }
      warn(BROWSER_HELP)
      return 2
    }

    if (area === "open") {
      if (!values.url) throw new Error("--url is required")
      return await openPage({ url: values.url, headed: values.headed, profile, log })
    }
    if (area === "extract") {
      if (!values.url) throw new Error("--url is required")
      return await extract({
        url: values.url,
        selector: values.selector,
        pageName: values.page,
        field: values.field,
        mode: values.mode,
        attr: values.attr,
        json: values.json,
        profile,
        log,
      })
    }
    if (area === "download") {
      if (!values.url) throw new Error("--url is required")
      return await download({
        url: values.url,
        out: values.out,
        selector: values.selector,
        profile,
        log,
      })
    }
    if (area === "page") {
      if (!values.url || !values.out) throw new Error("--url and --out are required")
      return await savePageCommand({ url: values.url, out: values.out, profile, log })
    }

    if (area === "learn") {
      if (action === "add") {
        if ((!values.html && !values.url) || !values.field) {
          throw new Error("--html FILE (or --url) and --field are required")
        }
        return await learnAdd({
          html: values.html,
          url: values.url,
          value: values.value,
          selector: values.selector,
          field: values.field,
          pageName: values.page,
          mode: values.mode || "text",
          attr: values.attr,
          log,
        })
      }
      if (action === "list") return learnList({ page: values.page, field: values.field, log })
      if (action === "stats") return learnStats({ log })
      if (action === "remove") return learnRemove({ id: values.id, log })
      if (action === "test") {
        if ((!values.html && !values.url) || !values.field) {
          throw new Error("--html FILE (or --url) and --field are required")
        }
        return await learnTest({
          html: values.html,
          url: values.url,
          field: values.field,
          pageName: values.page,
          mode: values.mode || "text",
          attr: values.attr,
          log,
        })
      }
      if (action === "reset") return learnReset({ page: values.page, yes: values.yes, log })
      warn(BROWSER_HELP)
      return 2
    }

    if (area === "record") {
      if (action === "start") {
        if (!values.name) throw new Error("--name is required")
        return await recordStart({
          name: values.name,
          url: values.url || "about:blank",
          profile,
          timeoutMs,
          log,
        })
      }
      if (action === "list") return recordList({ log })
      if (action === "show") {
        if (!values.name) throw new Error("--name is required")
        return recordShow({ name: values.name, log })
      }
      if (action === "delete") {
        if (!values.name) throw new Error("--name is required")
        return recordDelete({ name: values.name, yes: values.yes, log })
      }
      warn(BROWSER_HELP)
      return 2
    }

    if (area === "replay") {
      if (!values.name) throw new Error("--name is required")
      return await replay({
        name: values.name,
        headed: values.headed,
        profile,
        timeoutMs,
        downloadDir: values.downloadDir,
        log,
      })
    }

    warn(BROWSER_HELP)
    return 2
  } catch (error) {
    return fail(warn, error)
  }
}
