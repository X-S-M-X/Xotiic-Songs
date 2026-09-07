# Private drafts and scheduled releases

Update 22 keeps cover-only song projects in your device's Artwork Vault. Online drafts, future schedules and archives use a separate private GitHub repository. The public player only receives public releases.

The main Update 22 installer does not create this repository or move existing music. Complete this setup once before using online drafts or new schedules. Publishing immediately and local Artwork Vault projects remain available.

## Before setup

1. Keep a copy of your local music and covers. Use Artwork Vault > Back up for local projects, and Security > vault backup for your encrypted login.
2. Install GitHub CLI if needed: https://cli.github.com/
3. Run `gh auth login` as X-S-M-X. Repository setup needs private repository access and permission to write workflow files. If GitHub reports missing workflow scope, follow its authentication instructions.
4. In GitHub, create a fine-grained token restricted to **Xotiic-Songs** and **Xotiic-Songs-Private**, with **Contents: Read and write**. Create the private repository first through the script if it does not yet exist, then create the token when prompted. Do not paste a token into this chat or commit it.

## Run the setup

After installing Update 22:

```powershell
$repo = "$env:USERPROFILE\Downloads\XotiicDuck-Music-Portable"
Set-Location -LiteralPath $repo
Set-ExecutionPolicy -Scope Process Bypass
& "$repo\scripts\setup-private.ps1" -Repo $repo
```

The script creates or verifies the private repository, installs the private publishing workflow, and prompts securely through GitHub CLI for the token. It previews the migration before asking you to type **MOVE**.

The migration copies each unreleased record and its media, verifies the destination records and file hashes, then removes the current public copies. It preserves assets shared by remaining public songs. An interrupted run retains the source until verification succeeds. If it reports conflicting copies, review those copies before retrying.

Songs already live under the old date-based schedule remain live. Current public records are stripped of private project fields when migrated or built for Pages.

**Previously public files remain in Git history and may already have been downloaded. This migration does not make past public copies private or rewrite history.**

## Connect the Artist Console

Your existing encrypted console token also needs Contents read/write permission for both repositories. Adjust the selected repositories on that token, or use the console's existing token-update controls. Do not delete your Artwork Vault or reset the browser.

Refresh Manage music. The private-storage status should show connected. Private cover/audio previews use authenticated requests, with temporary preview URLs cleared when the console locks.

## Scheduling

Open the private repository's Actions tab and confirm **Publish due releases** succeeds. Use **Run workflow** for an immediate check.

The workflow checks at minutes 17 and 47 of each hour. GitHub schedules can be delayed, so publication is not guaranteed to the exact minute. The public deployment runs its tests after the publishing commit.

The workflow requires a cross-repository token stored as the private Actions secret `XOTIIC_PUBLISH_TOKEN`. A normal `GITHUB_TOKEN` push generally does not trigger another workflow, so it is not a substitute for this secret.

Private Actions usage is subject to your GitHub plan's allowance. No paid service or billing setting is enabled by the update.

Official references:
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- https://cli.github.com/manual/gh_secret_set
