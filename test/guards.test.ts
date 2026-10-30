import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAny } from "../src/core/glob.js";
import {
  applyEdits,
  checkToolCall,
  dependencyManifests,
  editTargets,
  type GuardEnv,
  isProtectedPath,
  mentionRule,
  protectedClass,
  shellMayWriteProtected,
  shellWriteScan,
  shellWriteTargets,
  toRepoTarget,
} from "../src/hooks/guards.js";
import { BLOWUP_MS } from "./helpers/limits.js";

describe("glob", () => {
  it("handles ** at any depth, including zero", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("**/migrations/**").test("db/migrations/001.sql")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
  });

  it("normalises Windows separators and ./", () => {
    expect(matchesAny(".\\.context\\STATE.md", [".context/STATE.md"])).toBe(true);
  });
});

describe("guards", () => {
  it("protects generated and append-only state", () => {
    expect(isProtectedPath(".context/STATE.md")).toBe(true);
    expect(isProtectedPath(".context/decisions/0001-x.md")).toBe(true);
    expect(isProtectedPath(".context/tasks.jsonl")).toBe(true);
    expect(isProtectedPath(".context/spec.md")).toBe(false);
  });

  it("extracts edit targets across harnesses", () => {
    expect(editTargets("Edit", { file_path: "/r/.context/STATE.md" })).toEqual([
      "/r/.context/STATE.md",
    ]);
    expect(editTargets("write_file", { file_path: "a.md" })).toEqual(["a.md"]);
    const patch = "*** Begin Patch\n*** Update File: .context/STATE.md\n@@\n*** End Patch";
    expect(editTargets("apply_patch", { input: patch })).toEqual([".context/STATE.md"]);
    expect(editTargets("Read", { file_path: "x" })).toEqual([]);
  });

  it("flags shell writes to protected paths, not reads", () => {
    expect(shellMayWriteProtected("echo hi >> .context/STATE.md")).toBe(true);
    expect(shellMayWriteProtected("sed -i 's/a/b/' .context/decisions/0001-x.md")).toBe(true);
    expect(shellMayWriteProtected("echo '{}' >> .context/tasks.jsonl")).toBe(true);
    expect(shellMayWriteProtected("cat .context/STATE.md")).toBe(false);
    expect(shellMayWriteProtected("echo hi > notes.md")).toBe(false);
  });
});

describe("shellWriteTargets", () => {
  const deny: [string, string][] = [
    ["echo hi >> .context/STATE.md", "state"],
    ["echo x > .context\\STATE.md", "state"],
    ["echo x>N:\\repo\\.context\\STATE.md", "state"],
    ["sed -i 's/a/b/' .context/decisions/0001-x.md", "adr-shell"],
    ["echo '{}' >> .context/tasks.jsonl", "tasks"],
    ["cat notes.md | tee -a .context/memories.jsonl", "memories"],
    ["Set-Content -Path .context\\STATE.md -Value x", "state"],
    ['"x" | Out-File -FilePath ".\\.context\\STATE.md"', "state"],
    ["Add-Content .context/tasks.jsonl '{}'", "tasks"],
    ["cp /tmp/state.md .context/STATE.md", "state"],
    ["mv .context/tasks.jsonl /tmp/t.jsonl", "tasks"],
    ["rm -rf .context", "context-dir"],
    ["git checkout -- .context/tasks.jsonl", "tasks"],
    [`node -e "require('fs').writeFileSync('.context/STATE.md','x')"`, "state"],
    ['powershell -Command "Set-Content .context\\STATE.md x"', "state"],
    ["perl -pi -e 's/a/b/' .context/STATE.md", "state"],
    ["Remove-Item .context\\decisions\\0001-x.md", "adr-shell"],
    ["echo x &> .context/STATE.md", "state"],
    ["ECHO X > .CONTEXT\\STATE.MD", "state"],
    ['[IO.File]::WriteAllText(".context/STATE.md", "x")', "state"],
    ['bash -c "rm .context/memories.jsonl"', "memories"],
    ["rm -rf .context/.cache/tasks.db", "cache"],
    ["git -C sub checkout -- .context/STATE.md", "state"],
    ['"x" | Tee-Object -FilePath .context\\STATE.md', "state"],
    ["clc .context\\STATE.md", "state"],
    ['cmd /C "del .context\\tasks.jsonl"', "tasks"],
    ['powershell -COMMAND "Out-File -FilePath .context\\STATE.md"', "state"],
    ["C:\\tools\\rm.cmd .context\\STATE.md", "state"],
    ["rm -rf .context/*", "context-dir"],
    ["rm -rf .context*", "context-dir"],
    ["rm -rf .cont*", "context-dir"],
    ["rm .contex?/STATE.md", "state"],
    ["sed -I '' 's/a/b/' .context/STATE.md", "state"],
    ["sed -Ie 's/a/b/' .context/STATE.md", "state"],
    ['[IO.Directory]::Delete(".context", $true)', "context-dir"],
    ["[System.IO.File]::Move('a', '.context/STATE.md')", "state"],
    [`node -e "require('fs').rm('.context', {recursive:true})"`, "context-dir"],
    [`node -e "fs.renameSync('a', '.context/STATE.md')"`, "state"],
    [`python -c "import shutil; shutil.rmtree('.context')"`, "context-dir"],
    [`python -c "import os; os.rename('a', '.context/STATE.md')"`, "state"],
    ["Remove-Item .context\\*", "context-dir"],
    ["rm .context/*.jsonl", "context-dir"],
    ["rm .context/STATE.*", "context-dir"],
    ["sed -ri 's/a/b/' .context/STATE.md", "state"],
    ["sed -Ei 's/a/b/' .context/STATE.md", "state"],
    ["sed --in-place=.bak 's/a/b/' .context/STATE.md", "state"],
    [`node -e "require('fs').rmSync('.context/STATE.md')"`, "state"],
    [`node -e "require('fs').unlinkSync('.context/tasks.jsonl')"`, "tasks"],
    [`python -c "import os; os.remove('.context/STATE.md')"`, "state"],
    ["git restore .context/tasks.jsonl", "tasks"],
    ["git restore --staged --worktree .context/tasks.jsonl", "tasks"],
    ["git restore -SW .context/STATE.md", "state"],
    [`deno eval "Deno.writeFileSync('.context/STATE.md', x)"`, "state"],
    [`ruby -e "File.rename('a', '.context/STATE.md')"`, "state"],
  ];
  it.each(deny)("denies %s", (cmd, rule) => {
    const hits = shellWriteTargets(cmd);
    expect(hits.length).toBeGreaterThan(0);
    expect(mentionRule(hits[0] ?? "")).toBe(rule);
  });

  const allow = [
    "cat .context/STATE.md",
    "git add .context/decisions/0018-x.md .context/tasks.jsonl",
    'git commit -m "docs: a then b" -- .context/tasks.jsonl',
    "grep -n status .context/decisions/*.md > out.txt",
    "cp .context/STATE.md /tmp/state-copy.md",
    'node dist/baton.mjs task close bt-1 --reason "check passed"',
    "echo hi > notes.md",
    "sed -n 1,20p .context/STATE.md",
    "Get-Content .context\\STATE.md | Select-Object -First 5",
    "npm run check 2>&1 | tee check.log",
    "ls .context/knowledge && rm .context/knowledge/old.md",
    "git diff -- .context/tasks.jsonl",
    "cat .context/STATE.md.bak > x",
    "node dist/baton.mjs decide --accept 22",
    "git -C sub log -- .context/STATE.md",
    "sed -n p .context/STATE.md",
    "grep -rn rename .context/",
    "grep -n unlink .context/STATE.md",
    "rg copyFile .context/",
    "git log --grep rename -- .context/tasks.jsonl",
    'git commit -m "refactor: rename foo" -- src/a.ts .context/tasks.jsonl',
    "ls .context/*",
    "cat .context/*.md",
    "ls .c*",
    "ls .context/knowledge/*.md",
    'git commit -m "fix writeFile race" -- src/a.ts .context/tasks.jsonl',
    'git commit -m "guards: deny Set-Content and Out-File" -- src/hooks/guards.ts .context/tasks.jsonl',
    'grep -rn "writeFileSync" .context/',
    'rg "Remove-Item" .context/knowledge .context/decisions',
    'egrep "appendFile" .context/STATE.md',
    'Select-String -Pattern "WriteAllText" .context\\STATE.md',
    'echo "New-Item" .context/STATE.md',
    'node dist/baton.mjs task create "fix writeFile in .context/tasks.jsonl"',
    "git restore --staged .context/tasks.jsonl",
    "git restore -S .context/STATE.md",
  ];
  it.each(allow)("allows %s", (cmd) => {
    expect(shellWriteTargets(cmd)).toEqual([]);
  });

  // bt-2a8: data-argument commands that still run code.
  const codeDeny: [string, string][] = [
    [`echo $(node -e "require('fs').writeFileSync('.context/STATE.md','x')")`, "state"],
    ["echo `node -e \"require('fs').writeFileSync('.context/STATE.md','x')\"`", "state"],
    [`printf %s "$(node -e "require('fs').writeFileSync('.context/tasks.jsonl','')")"`, "tasks"],
    [`grep x "$(python -c "open('.context/memories.jsonl','w')")"`, "memories"],
    ["echo $(rm .context/STATE.md)", "state"],
    ["echo `rm -rf .context`", "context-dir"],
    [
      `git rebase --exec "node -e \\"require('fs').writeFileSync('.context/STATE.md','x')\\"" HEAD~1`,
      "state",
    ],
    [
      `git rebase -x "node -e \\"require('fs').writeFileSync('.context/STATE.md','x')\\"" HEAD~1`,
      "state",
    ],
    ["git rebase --exec 'rm .context/tasks.jsonl' HEAD~2", "tasks"],
    ["git rebase --exec='rm .context/tasks.jsonl' HEAD~2", "tasks"],
    [`git bisect run node -e "require('fs').writeFileSync('.context/STATE.md','x')"`, "state"],
    ["git bisect run rm .context/STATE.md", "state"],
    [
      `git submodule foreach "node -e \\"require('fs').unlinkSync('../.context/tasks.jsonl')\\""`,
      "tasks",
    ],
    ["git submodule foreach --recursive 'rm ../.context/STATE.md'", "state"],
    [
      `git -c alias.x='!node -e "require(\\"fs\\").writeFileSync(\\".context/STATE.md\\",\\"x\\")"' x`,
      "state",
    ],
    ["git -c alias.x='!rm .context/memories.jsonl' x", "memories"],
    [`rg --pre ./pre.sh "writeFileSync" .context/STATE.md`, "state"],
    ["rg --pre rm x .context/STATE.md", "state"],
    ["rg --pre=./wipe.sh x .context/tasks.jsonl", "tasks"],
    [`php -r "file_put_contents('.context/STATE.md', 'x');"`, "state"],
    [`php -r "fopen('.context/tasks.jsonl', 'w');"`, "tasks"],
    // Fail-safe: inside double quotes $(…) is a real substitution in bash.
    ['git commit -m "guards: scan $(…) for writeFileSync" -- .context/tasks.jsonl', "tasks"],
  ];
  it.each(codeDeny)("denies code in a data command: %s", (cmd, rule) => {
    const hits = shellWriteTargets(cmd);
    expect(hits.length).toBeGreaterThan(0);
    expect(mentionRule(hits[0] ?? "")).toBe(rule);
  });

  const codeAllow = [
    'git commit -m "fix writeFile race" -- src/a.ts .context/tasks.jsonl',
    'git commit -m "guards: deny Set-Content and Out-File" -- src/hooks/guards.ts .context/tasks.jsonl',
    'grep -rn "writeFileSync" .context/',
    'rg "Remove-Item" .context/knowledge .context/decisions',
    "git restore --staged .context/tasks.jsonl",
    'git log -S "writeFile" -- .context/tasks.jsonl',
    "git commit -m 'docs: explain $(…) handling' -- .context/tasks.jsonl",
    "git commit -m 'guards: scan $(…) for writeFileSync' -- .context/tasks.jsonl",
    "git commit -m 'guards: name `writeFileSync` in the scan' -- .context/tasks.jsonl",
    'git commit -m "$(cat msg.txt)" -- .context/tasks.jsonl',
    'git -c core.autocrlf=false commit -m "fix writeFile race" -- .context/tasks.jsonl',
    "git rebase main -- .context/tasks.jsonl",
    'git bisect good -- .context/STATE.md "writeFile"',
    "git submodule status -- .context",
    "rg --pre-glob '*.gz' \"writeFile\" .context/",
    "echo $(cat .context/STATE.md)",
  ];
  it.each(codeAllow)("allows data in a data command: %s", (cmd) => {
    expect(shellWriteTargets(cmd)).toEqual([]);
  });

  // bt-2a8 fix round 1.
  const W = `node -e "require('fs').writeFileSync('.context/STATE.md','x')"`;
  const heredocMsg = (body: string): string =>
    `git commit -m "$(cat <<'EOF'\nfix(guards): keep the scan\n\n${body}\nEOF\n)" -- src/hooks/guards.ts .context/tasks.jsonl`;
  const round1Deny: [string, string][] = [
    [`echo <(${W})`, "state"],
    [`grep x <(${W})`, "state"],
    [`cat <(${W})`, "state"],
    [`echo x > >(${W})`, "state"],
    ["echo (Set-Content .context\\STATE.md x)", "state"],
    ["echo @(Set-Content .context\\STATE.md x)", "state"],
    ["Write-Output (Remove-Item .context\\tasks.jsonl)", "tasks"],
    ["(rm .context/STATE.md)", "state"],
    ["echo x; (rm .context/STATE.md)", "state"],
    ["( rm .context/STATE.md )", "state"],
    ["{ rm .context/STATE.md; }", "state"],
    ['git commit -m "docs: never `rm .context/tasks.jsonl` by hand"', "tasks"],
    [`echo \\' $(${W})`, "state"],
    [`echo $'\\'' $(${W})`, "state"],
    [`echo "a \\" it's" $(${W})`, "state"],
    ["echo \\\\$(rm .context/STATE.md)", "state"],
    ["node <<'EOF'\nrequire('fs').writeFileSync('.context/STATE.md','x')\nEOF", "state"],
    ["bash <<'EOF'\nrm .context/STATE.md\nEOF", "state"],
    ["cat <<EOF\n$(rm .context/STATE.md)\nEOF", "state"],
    ["git rebase -ix 'rm .context/STATE.md' HEAD~2", "state"],
    ["git rebase --exe 'rm .context/STATE.md' HEAD~2", "state"],
    ["git submodule foreach -q 'rm ../.context/STATE.md'", "state"],
    ["git submodule foreach --quiet --recursive 'rm ../.context/STATE.md'", "state"],
    ['git -c alias.x="!rm .context/memories.jsonl" x', "memories"],
    ['git -c "alias.x=!rm .context/memories.jsonl" x', "memories"],
    ["git -c alias.x=!rm\\ .context/memories.jsonl x", "memories"],
    [`php -r "fopen('.context/tasks.jsonl', 'a+b');"`, "tasks"],
    [`python -c "open('.context/tasks.jsonl', mode='w')"`, "tasks"],
    ["echo $(echo $(echo $(echo $(echo $(echo $(rm .context/STATE.md))))))", "state"],
  ];
  it.each(round1Deny)("denies (round 1) %s", (cmd, rule) => {
    const hits = shellWriteTargets(cmd);
    expect(hits.length).toBeGreaterThan(0);
    expect(mentionRule(hits[0] ?? "")).toBe(rule);
  });

  const round1Allow = [
    heredocMsg("Now `echo $(rm .context/STATE.md)` is denied."),
    heredocMsg("The guard scans for `writeFileSync` near .context/tasks.jsonl."),
    "git commit -m \"$(cat <<-'EOF'\n\tNow `rm .context/STATE.md` is denied.\n\tEOF\n)\" -- .context/tasks.jsonl",
    'git commit -m "$(cat <<"EOF"\nNow `rm .context/STATE.md` is denied.\nEOF\n)" -- .context/tasks.jsonl',
    'git commit -m "$(cat <<\\EOF\nNow `rm .context/STATE.md` is denied.\nEOF\n)" -- .context/tasks.jsonl',
    'git commit -m "docs: never \\`rm .context/tasks.jsonl\\` by hand"',
    'git commit -m "guards: scan \\$(...) for writeFileSync" -- .context/tasks.jsonl',
    'echo "$(git log -1 --format=%s -- .context/tasks.jsonl)"',
    "x=$(grep -c writeFileSync .context/knowledge/harness-limits.md)",
    "echo $(echo $(echo $(echo $(echo $(echo $(cat .context/STATE.md))))))",
    "echo $((1 + 2)) .context/STATE.md",
  ];
  it.each(round1Allow)("allows (round 1) %s", (cmd) => {
    expect(shellWriteTargets(cmd)).toEqual([]);
  });

  it("denies a 6000-deep substitution without throwing", () => {
    const cmd = `echo ${"$(".repeat(6000)}rm .context/STATE.md${")".repeat(6000)}`;
    expect(() => shellWriteTargets(cmd)).not.toThrow();
    expect(shellWriteTargets(cmd)).toEqual([".context/STATE.md"]);
  });

  it("denies every protected mention in a command over 16 KB", () => {
    const long = `echo ${"x".repeat(17_000)} .context/STATE.md`;
    expect(shellWriteTargets(long).map(mentionRule)).toEqual(["state"]);
    expect(shellWriteTargets(`echo ${"x".repeat(17_000)}`)).toEqual([]);
  });

  it("caps the cost of deep nesting and long dense commands", () => {
    const deep = `echo ${"$(".repeat(4000)}rm .context/STATE.md${")".repeat(4000)}`;
    const capped = { targets: [".context/STATE.md"], capped: true };
    expect(shellWriteScan(deep)).toEqual(capped);
    const dense = `echo $(echo ${"=:".repeat(24 * 1024)}) .context/STATE.md`;
    expect(shellWriteScan(dense)).toEqual(capped);
    for (const api of ["fopen(", "open("]) {
      const long = `php -r "${api.repeat(8 * 1024)}" .context/STATE.md`;
      expect(shellWriteScan(long)).toEqual(capped);
      const short = `php -r "${api.repeat(2000)}" .context/STATE.md`;
      expect(() => shellWriteTargets(short)).not.toThrow();
    }
  });

  // bt-2a8 fix round 2.
  const NW = "require('fs').writeFileSync('.context/STATE.md','x')";
  const RM = "rm .context/STATE.md";
  const round2Deny: [string, string][] = [
    // R1: a quoted heredoc body is blanked only inside git commit/tag, gh, echo or printf.
    [`cat <<'EOF' | bash\n${RM}\nEOF`, "state"],
    [`cat <<'EOF' | sh\n${RM}\nEOF`, "state"],
    [`cat <<'EOF' | node\n${NW}\nEOF`, "state"],
    [`bash -c "$(cat <<'EOF'\n${RM}\nEOF\n)"`, "state"],
    [`node -e "$(cat <<'EOF'\n${NW}\nEOF\n)"`, "state"],
    [`eval "$(cat <<'EOF'\n${RM}\nEOF\n)"`, "state"],
    [`source <(cat <<'EOF'\n${RM}\nEOF\n)`, "state"],
    [`bash <(cat <<'EOF'\n${RM}\nEOF\n)`, "state"],
    [`echo "$(cat <<'EOF'\n${RM}\nEOF\n)" | bash`, "state"],
    [`bash -c "$(echo "$(cat <<'EOF'\n${RM}\nEOF\n)")"`, "state"],
    [`git commit -m "$(cat <<'EOF'\nmsg\nEOF\n)" && ${RM}`, "state"],
    [`echo $(cat <<'EOF'\nx\nEOF\n) $(${RM})`, "state"],
    // Fail safe by choice: outside the narrow form a quoted heredoc body is read as code.
    [`cat <<'EOF'\nNow \`${RM}\` is denied.\nEOF`, "state"],
    // Quotes in a heredoc body do not hide what follows it.
    [`cat <<'EOF'\ndon't\nEOF\necho $(${RM})`, "state"],
    [`cat <<EOF\ndon't $(${RM})\nEOF`, "state"],
    // R2: quotes are read on the raw text; only a real backslash escapes.
    [`echo src/'a' $(node -e "${NW}")`, "state"],
    [`echo a/'b' \`${RM}\``, "state"],
    [`ls src/'x y' $(${RM})`, "state"],
    [`grep x ./'my file' <(node -e "${NW}")`, "state"],
    [`echo "a/" $(${RM})`, "state"],
    // Folded: an escaped space in an unquoted rebase exec command.
    [`git rebase -x rm\\ .context/STATE.md HEAD~2`, "state"],
    [`git rebase --exec rm\\ .context/STATE.md HEAD~2`, "state"],
    [`git rebase -xrm\\ .context/STATE.md HEAD~2`, "state"],
  ];
  it.each(round2Deny)("denies (round 2) %s", (cmd, rule) => {
    const hits = shellWriteTargets(cmd);
    expect(hits.length).toBeGreaterThan(0);
    expect(mentionRule(hits[0] ?? "")).toBe(rule);
  });

  const round2Allow = [
    `gh pr create --title x --body "$(cat <<'EOF'\nNow \`${RM}\` is denied.\nEOF\n)"`,
    `echo "$(cat <<'EOF'\n${RM}\nEOF\n)"`,
    `printf '%s\\n' "$(cat <<'EOF'\n${RM}\nEOF\n)" > notes.md`,
    `git tag -a v1 -m "$(cat <<'EOF'\nNow \`${RM}\` is denied.\nEOF\n)"`,
    `git commit -m "$(cat <<'EOF'\nfix (a) b) c: \`${RM}\` and don't\nEOF\n)" -- .context/tasks.jsonl`,
  ];
  it.each(round2Allow)("allows (round 2) %s", (cmd) => {
    expect(shellWriteTargets(cmd)).toEqual([]);
  });

  it("denies inside the work budget whatever the input (round 2)", () => {
    const fillTo = (pre: string, unit: string, post: string): string =>
      pre + unit.repeat(Math.floor((16_383 - pre.length - post.length) / unit.length)) + post;
    const W = `${RM}; `;
    const cases = [
      fillTo(`${W}echo $(echo $(echo $(echo $(echo $(rm `, "=:", "))))) .context/STATE.md"),
      fillTo(`${W}bash -c "echo $(bash -c "echo $(bash -c "echo $(echo `, "=:", ')")")"'),
      fillTo(`${W}echo $(bash -c "echo $(bash -c "echo `, "=:", '")")'),
      fillTo(`${W}echo ( $( ( $( ( `, "=:", " ) ) ) ) )"),
      fillTo(`${W}x=$(y=$(z=$(w=$(v=$(`, "=:", ")))))"),
      fillTo(`${W}git -c alias.x=!$(git -c alias.y=!$(echo $(echo `, "=:", "))) x"),
      fillTo(`${W}git rebase -x "$(git rebase -x "$(echo $(echo `, "=:", '))")"'),
      fillTo(`${W}cat <(echo >(echo $(echo $(rm `, "=:", "))))"),
      fillTo(`${W}git submodule foreach "$(git submodule foreach "$(echo $(echo `, "=:", '))")"'),
      fillTo(`${W}cat $(cat $(cat $(cat $(cat $(cat `, "<<'E' ", ")))))"),
      fillTo(`${W}bash -c "cat $(bash -c "cat $(bash -c "cat $(cat `, "<<'E' ", ')")")"'),
      fillTo(`${W}cat `, "<<'E' ", ""),
      fillTo(`${W}cat `, "<<-\\E ", ""),
      fillTo("echo $(echo ", "=:", ") .context/STATE.md; rm .context/STATE.md"),
    ];
    let worst = 0;
    for (const cmd of cases) {
      const t = performance.now();
      expect(shellWriteTargets(cmd)).toContain(".context/STATE.md");
      worst = Math.max(worst, performance.now() - t);
    }
    expect(worst).toBeLessThan(BLOWUP_MS);
  });

  // bt-6yv: nested heredoc bodies are charged to the work budget and capped in depth.
  it.each([
    ["40 nested unquoted heredocs", `${RM}; echo ${"$(cat <<A\n".repeat(40)}`, "posix"],
    ["2000 nested quoted heredocs", `${RM}; ${"<<'A'\n".repeat(2000)}`, "posix"],
    [
      "4250 nested here-strings",
      `Remove-Item .context/STATE.md; ${"@'\n".repeat(4250)}`,
      "powershell",
    ],
  ] as const)("fails safe on %s", (_name, cmd, dialect) => {
    const scan = shellWriteScan(cmd, dialect);
    expect(scan.targets).toEqual([".context/STATE.md"]);
    expect(scan.capped).toBe(true);
  });

  it("reads a heredoc nested within the depth cap precisely", () => {
    const cmd = `cat <<A\n$(cat <<B\n${RM}\nB\n)\nA`;
    expect(shellWriteScan(cmd)).toEqual({ targets: [".context/STATE.md"], capped: false });
    const quiet = "cat <<A\n$(cat <<B\nhello\nB\n)\nA";
    expect(shellWriteScan(quiet)).toEqual({ targets: [], capped: false });
  });

  it("normalises a quoted ./ mention and is repeatable", () => {
    const cmd = 'echo x > "./.context/STATE.md"';
    expect(shellWriteTargets(cmd)).toEqual([".context/STATE.md"]);
    expect(shellWriteTargets(cmd)).toEqual([".context/STATE.md"]);
  });
});

describe("toRepoTarget", () => {
  it("relativises against the root", () => {
    expect(toRepoTarget("N:\\repo\\.context\\STATE.md", "N:\\repo", "N:\\repo", "win32")).toBe(
      ".context/STATE.md",
    );
    expect(toRepoTarget("n:/REPO/.context/state.md", "N:\\repo", "N:\\repo", "win32")).toBe(
      ".context/state.md",
    );
    const l = (p: string, cwd = "/work/demo", root = "/work/demo") =>
      toRepoTarget(p, root, cwd, "linux");
    expect(l("/work/demo/.context/STATE.md")).toBe(".context/STATE.md");
    expect(l("/work/Demo/.context/STATE.md")).toBeNull();
    expect(l(".context/STATE.md", "/work/demo/src")).toBe("src/.context/STATE.md");
    expect(l("../.context/STATE.md", "/work/demo/src")).toBe(".context/STATE.md");
    expect(l("./.context/STATE.md")).toBe(".context/STATE.md");
    expect(l("/elsewhere/x")).toBeNull();
    expect(l("/work/demo")).toBeNull();
  });
});

describe("protectedClass", () => {
  it("classifies repo paths", () => {
    for (const p of ["win32", "linux"] as const) {
      expect(protectedClass(".context/STATE.md", p)).toBe("state");
    }
    expect(protectedClass(".context/state.md", "win32")).toBe("state");
    expect(protectedClass(".context/state.md", "linux")).toBeNull();
    expect(protectedClass(".context/tasks.jsonl", "linux")).toBe("tasks");
    expect(protectedClass(".context/memories.jsonl", "linux")).toBe("memories");
    expect(protectedClass(".context/.cache/tasks.db", "linux")).toBe("cache");
    expect(protectedClass(".beads/issues.jsonl", "linux")).toBe("beads");
    expect(protectedClass(".context/decisions/0001-x.md", "linux")).toBe("decision");
    expect(protectedClass(".context/decisions/0001-X.md", "linux")).toBe("decision");
    expect(protectedClass(".context/decisions/0000-template.md", "linux")).toBeNull();
    expect(protectedClass(".context/decisions/README.md", "linux")).toBeNull();
    for (const p of [".context/spec.md", ".context/knowledge/x.md", "src/a.ts"]) {
      expect(protectedClass(p, "linux")).toBeNull();
    }
  });
});

describe("dependencyManifests", () => {
  it("finds the manifest a command changes", () => {
    for (const c of [
      "npm install zod",
      "npm i -D vitest",
      "pnpm add react",
      "yarn add lodash",
      "bun add x",
      "npm run build && npm install zod",
    ]) {
      expect(dependencyManifests(c)).toEqual(["package.json"]);
    }
    for (const c of ["npm install", "npm ci", "echo npm install zod", "npx vitest"]) {
      expect(dependencyManifests(c)).toEqual([]);
    }
    for (const c of [
      "pip install requests",
      "python -m pip install x",
      "pip install -r req.txt requests",
    ]) {
      expect(dependencyManifests(c)).toEqual(["requirements.txt", "pyproject.toml"]);
    }
    for (const c of [
      "pip install -r requirements.txt",
      "pip install --requirement=requirements.txt",
      "pip install -e .",
    ]) {
      expect(dependencyManifests(c)).toEqual([]);
    }
    expect(dependencyManifests("uv add httpx")).toEqual(["pyproject.toml"]);
    expect(dependencyManifests("cargo add serde")).toEqual(["Cargo.toml"]);
    expect(dependencyManifests("go get example.com/x")).toEqual(["go.mod"]);
  });
});

describe("applyEdits", () => {
  const cur = "---\nid: a\nstatus: proposed\n---\n# T\n\nproposed body.\n";
  it("replays Edit, MultiEdit and gives up on the rest", () => {
    expect(applyEdits("Edit", { old_string: "proposed", new_string: "accepted" }, cur)).toBe(
      cur.replace("proposed", "accepted"),
    );
    expect(
      applyEdits(
        "Edit",
        { old_string: "proposed", new_string: "accepted", replace_all: true },
        cur,
      ),
    ).toBe(cur.split("proposed").join("accepted"));
    expect(
      applyEdits(
        "MultiEdit",
        {
          edits: [
            { old_string: "body", new_string: "text" },
            { old_string: "# T", new_string: "# U" },
          ],
        },
        cur,
      ),
    ).toBe(cur.replace("body", "text").replace("# T", "# U"));
    expect(applyEdits("Edit", { old_string: "missing", new_string: "x" }, cur)).toBe(cur);
    expect(applyEdits("NotebookEdit", {}, cur)).toBeNull();
  });
});

describe("checkToolCall", () => {
  const DRAFT = "---\nid: adr-0003\nkind: decision\nstatus: proposed\n---\n# Draft\n\nDraft.\n";
  const env: GuardEnv = {
    root: "N:\\repo",
    cwd: "N:\\repo",
    platform: "win32",
    adrState: (p) =>
      p.endsWith("0001-x.md")
        ? { exists: true, status: "accepted" }
        : p.endsWith("0003-draft.md")
          ? { exists: true, status: "proposed" }
          : { exists: false, status: null },
    readText: (p) => (p.endsWith("0003-draft.md") ? DRAFT : null),
  };
  const dir = "N:\\repo\\.context\\decisions\\";
  const draft = `${dir}0003-draft.md`;
  const rule = (tool: string, input: Record<string, unknown>) =>
    checkToolCall(tool, input, env)?.rule ?? null;

  it("denies protected files", () => {
    const d = checkToolCall("Edit", { file_path: "N:\\repo\\.context\\STATE.md" }, env);
    expect(d?.rule).toBe("state");
    expect(d?.reason).toContain("baton handoff");
    expect(rule("NotebookEdit", { notebook_path: "N:/repo/.context/tasks.jsonl" })).toBe("tasks");
  });

  it("reads PowerShell commands without bash escapes (bt-2a8)", () => {
    const ps = (command: string) => rule("PowerShell", { command });
    expect(ps('git commit -m "fix writeFile race" -- src/a.ts .context\\tasks.jsonl')).toBeNull();
    expect(ps('Write-Output "$(Set-Content -Path .context\\STATE.md -Value x)"')).toBe("state");
    // In PowerShell a backslash escapes nothing, so this subexpression runs.
    expect(ps('Write-Output "x\\$(Set-Content .context\\STATE.md x)"')).toBe("state");
    expect(rule("Bash", { command: 'echo "x\\$(rm .context/STATE.md)"' })).toBeNull();
    // Round 2: a backslash before a quote ends a PowerShell string; the backtick escapes.
    expect(ps('echo "C:\\" (Set-Content .context\\STATE.md x)')).toBe("state");
    expect(ps("echo 'C:\\' (Set-Content .context\\STATE.md x)")).toBe("state");
    expect(ps('Write-Output "`$(x)" $(Set-Content .context\\STATE.md x)')).toBe("state");
    expect(ps("Write-Output 'it''s' $(Set-Content .context\\STATE.md x)")).toBe("state");
    expect(ps("@'\nit's\n'@ | Out-Null; echo $(Set-Content .context\\STATE.md x)")).toBe("state");
    expect(
      ps('git commit -m "guards: deny writeFileSync`n`nbody" -- .context\\tasks.jsonl'),
    ).toBeNull();
    // Gemini's run_shell_command is read as Bash and as PowerShell; either deny wins.
    const gem = (command: string) => rule("run_shell_command", { command });
    expect(gem('Write-Output "x\\$(Set-Content .context\\STATE.md x)"')).toBe("state");
    expect(gem("echo `rm .context/STATE.md`")).toBe("state");
    expect(gem('git commit -m "fix writeFile race" -- src/a.ts .context/tasks.jsonl')).toBeNull();
  });

  it("covers decision records by status", () => {
    const n = checkToolCall("Write", { file_path: `${dir}0005-new.md`, content: "x" }, env);
    expect(n?.rule).toBe("adr-new");
    expect(n?.reason).toContain("baton decide");
    const f = checkToolCall("Edit", { file_path: `${dir}0001-x.md` }, env);
    expect(f?.rule).toBe("adr-final");
    expect(f?.reason).toContain('has status "accepted"');
    expect(f?.reason).toContain("--supersedes 0001");
  });

  it("replays edits of a proposed record", () => {
    const e = (o: string, n: string, extra = {}) => ({
      file_path: draft,
      old_string: o,
      new_string: n,
      ...extra,
    });
    expect(rule("Edit", e("Draft.", "Better."))).toBeNull();
    const s = checkToolCall("Edit", e("status: proposed", "status: accepted"), env);
    expect(s?.rule).toBe("adr-status");
    expect(s?.reason).toContain("--accept 0003");
    expect(rule("Edit", e("proposed", "accepted"))).toBe("adr-status");
    expect(rule("Edit", e("proposed", "accepted", { replace_all: true }))).toBe("adr-status");
    const one = { old_string: "Draft.", new_string: "Better." };
    expect(rule("MultiEdit", { file_path: draft, edits: [one] })).toBeNull();
    expect(
      rule("MultiEdit", {
        file_path: draft,
        edits: [one, { old_string: "kind: decision", new_string: "kind: knowledge" }],
      }),
    ).toBe("adr-status");
  });

  it("replays Write, NotebookEdit and apply_patch", () => {
    const w = (content: string) => rule("Write", { file_path: draft, content });
    expect(w(DRAFT.replace("Draft.\n", "New body.\n"))).toBeNull();
    expect(w(DRAFT.replace("Draft.\n", "New body.\n").replace(/\n/g, "\r\n"))).toBeNull();
    expect(w(DRAFT.replace("status:", 'supersedes: "0001"\nstatus:'))).toBe("adr-status");
    expect(w(DRAFT.replace("status: proposed", "status: accepted"))).toBe("adr-status");
    expect(rule("NotebookEdit", { notebook_path: draft })).toBe("adr-status");
    const patch = (body: string) =>
      `*** Begin Patch\n*** Update File: .context/decisions/0003-draft.md\n@@\n${body}\n*** End Patch`;
    expect(rule("apply_patch", { input: patch("-status: proposed\n+status: accepted") })).toBe(
      "adr-status",
    );
    expect(rule("apply_patch", { input: patch("-Draft.\n+Better.") })).toBeNull();
    const mv =
      "*** Begin Patch\n*** Update File: a.txt\n*** Move to: .context/STATE.md\n@@\n*** End Patch";
    expect(rule("apply_patch", { input: mv })).toBe("state");
    expect(editTargets("apply_patch", { input: mv })).toEqual(["a.txt", ".context/STATE.md"]);
  });

  it("covers shell tools and leaves other targets alone", () => {
    expect(rule("Bash", { command: "echo x > .context/decisions/0003-draft.md" })).toBe(
      "adr-shell",
    );
    expect(rule("PowerShell", { command: "Set-Content .context\\STATE.md x" })).toBe("state");
    expect(rule("run_shell_command", { command: "Set-Content .context\\STATE.md x" })).toBe(
      "state",
    );
    expect(rule("Edit", { file_path: "N:\\other\\.context\\STATE.md" })).toBeNull();
    expect(rule("Read", { file_path: "N:\\repo\\.context\\STATE.md" })).toBeNull();
    expect(rule("Edit", { file_path: ".context/spec.md" })).toBeNull();
  });
});

describe("windows path aliases", () => {
  it("classify as the protected file on win32", () => {
    for (const p of [
      "N:\\repo\\.context\\STATE.md.",
      "N:\\repo\\.context\\STATE.md::$DATA",
      "N:\\repo\\.context\\STATE.md. ",
      "\\\\?\\N:\\repo\\.context\\STATE.md",
      "\\?\\N:\\repo\\.context\\STATE.md",
      "N:\\repo\\.context\\STATE.md:stream",
    ]) {
      expect(toRepoTarget(p, "N:\\repo", "N:\\repo", "win32"), p).toBe(".context/STATE.md");
    }
    expect(toRepoTarget("N:\\repo\\.context\\tasks.jsonl.", "N:\\repo", "N:\\repo", "win32")).toBe(
      ".context/tasks.jsonl",
    );
    expect(protectedClass(".context/STATE.md.", "win32")).toBe("state");
    expect(protectedClass(".context/tasks.jsonl. ", "win32")).toBe("tasks");
    expect(protectedClass(".context/decisions/0001-x.md.", "win32")).toBe("decision");
    const root = "N:\\repo";
    for (const p of [
      "N:\\repo\\.context::$INDEX_ALLOCATION\\STATE.md",
      "N:\\repo\\.context:$I30:$INDEX_ALLOCATION\\STATE.md",
      "\\\\.\\N:\\repo\\.context\\STATE.md",
    ]) {
      expect(toRepoTarget(p, root, root, "win32"), p).toBe(".context/STATE.md");
    }
  });
});
