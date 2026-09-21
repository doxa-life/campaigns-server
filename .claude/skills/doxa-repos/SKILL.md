---
name: doxa-repos
description: Record and check where this machine keeps the other DOXA checkouts (marketing site, mobile app, resource pipeline, people-groups), so the cross-repo language skills can find them. Use when a language skill reports a missing or unusable repository path, or to move a checkout. Invoke with /doxa-repos.
user-invocable: true
---

# DOXA repository registry

The language skills work across five repositories. Every developer lays their
machine out differently, so no committed file names a path: the paths live in
`.claude/doxa-repos.json`, which is not tracked, and are asked for once.

## Check what is registered

```bash
python3 .claude/skills/doxa-repos/repos.py list
```

Each repository prints `ok`, `MISSING`, or `UNUSABLE` with the reason. The
command exits non-zero if any is not usable, so a skill can stop rather than
skip a surface without saying so.

## Register a checkout

```bash
python3 .claude/skills/doxa-repos/repos.py set marketing /path/to/doxa-life
```

Names: `marketing`, `mobile`, `pipeline`, `people-groups`. The campaigns server
is the repository this skill runs in and needs no entry.

The path is verified against the expected GitHub origin before it is recorded,
so a checkout of the wrong repository is refused with the URL of the right one.

## When a repository is missing

Ask the person for the path. If they do not have the repository, give them the
clone command and let them decide:

| Name | Repository |
|---|---|
| `marketing` | https://github.com/doxa-life/doxa-life |
| `mobile` | https://github.com/doxa-life/doxa-prayer-mobile-app |
| `pipeline` | https://github.com/doxa-life/doxa-resource-pipeline |
| `people-groups` | https://github.com/doxa-life/people-groups |

Never guess a path, and never search the filesystem for one.

## Other commands

```bash
python3 .claude/skills/doxa-repos/repos.py path mobile     # print one path
python3 .claude/skills/doxa-repos/repos.py forget pipeline # drop an entry
```
