import { join, dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const utf8EncodingOptions = { encoding: "utf8" };

/**
 * Order in which imports are searched
 * @see {https://nodejs.org/dist/latest/docs/api/packages.html#imports}
 */
const importsConditionOrder = ["browser", "default"];

/**
 * Order in which exports are searched
 * @see {https://nodejs.org/dist/latest/docs/api/packages.html#exports}
 */
const exportsConditionOrder = ["browser", "import", ".", "default"];

/**
 * find module inside a package
 * @param {string} parts
 * @param {Object} pkg package.json content
 * @param {string} path
 * @returns {string|undefined} module file name
 */
export function entryPoint(parts, pkg, path) {
  if (parts[0] === pkg.name) {
    if (parts.length === 1) {
      switch (typeof pkg.exports) {
        case "string":
          return join(path, pkg.exports);
        case "object":
          for (const condition of exportsConditionOrder) {
            if (pkg.exports[condition]) {
              return join(path, pkg.exports[condition]);
            }
          }
      }

      return join(path, pkg.main || "index.js");
    } else {
      // TODO find generlized form
      if (parts.length === 2) {
        const slot = "./" + parts[1];

        switch (typeof pkg.exports[slot]) {
          case "string":
            return join(path, pkg.exports[slot]);

          case "object":
            for (const condition of exportsConditionOrder) {
              if (pkg.exports[slot][condition]) {
                return join(path, pkg.exports[slot][condition]);
              }
            }
        }
      }
    }
  }
}

export async function resolveImport(name, file) {
  const parts = name.split(/\//);

  if (name.match(/^[\/\.]/)) {
    return resolve(dirname(file), name);
  }
  let { pkg, path } = await loadPackage(file);

  if (name.startsWith(pkg.name)) {
    return entryPoint(parts, pkg, path);
  }
  if (name.match(/^#/)) {
    const importSlot = pkg.imports[name];
    if (importSlot) {
      for (const condition of importsConditionOrder) {
        if (importSlot[condition]) {
          return join(path, importSlot[condition]);
        }
      }
    }
  }

  while (path.length > 1) {
    let p;
    try {
      p = join(path, "node_modules", parts[0]);
      pkg = JSON.parse(
        await readFile(join(p, "package.json"), utf8EncodingOptions)
      );
      return entryPoint(parts, pkg, p);
    } catch (e) {
      if (e.code !== "ENOTDIR" && e.code !== "ENOENT") {
        throw e;
      }
    }
    path = dirname(dirname(path));
  }
}

async function loadPackage(path) {
  while (path.length) {
    try {
      return {
        path,
        pkg: JSON.parse(
          await readFile(join(path, "package.json"), utf8EncodingOptions)
        )
      };
    } catch (e) {
      if (e.code !== "ENOTDIR" && e.code !== "ENOENT") {
        throw e;
      }
    }

    path = dirname(path);
  }
}
