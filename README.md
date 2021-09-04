# Actions Card to Issue

Convert GitHub projects card to the issue automatically,
with assignees & labels support!

- :ramen: Convert cards added to the project column to the issue automatically
- :ramen: Add assignees and labels from issue comments when the card is
converted to the issue automatically, or manually


# Getting Started

> :warning: **WARNING!** **DO** specify the event types for `project_card` trigger!
> **DO NOT** specify both `created` and `converted` event types! It's just useless.

## Convert all the cards to the issue when they are created

1. Create the workflow file in your repository:

`.github/workflows/card-to-issue.yml`

```yaml
name: convert project card to issue
on:
  project_card:
    types: [created]

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: sarisia/actions-card-to-issue@v1
```

1. All set! When you create the card in your project,
it will be converted to the issue in a few seconds.

![image](https://user-images.githubusercontent.com/33576079/132085416-a0b4e2c7-c964-44a0-980b-f329e1a5dfff.png)

![image](https://user-images.githubusercontent.com/33576079/132085426-e8e8e280-1068-47f7-a3b3-4fd9105d2276.png)

![image](https://user-images.githubusercontent.com/33576079/132085441-bad402e0-6344-4e96-bfaa-a3916282e54c.png)

## Add assignees and labels to the issue manually converted from the card

1. Create the workflow file in your repository:

`.github/workflows/card-to-issue.yml`

```yaml
name: convert project card to issue
on:
  project_card:
    types: [converted]

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: sarisia/actions-card-to-issue@v1
```

2. All set! When you do `Convert to issue` to the project card,
assignees and labels specified in note will be added to the converted
issue.

![image](https://user-images.githubusercontent.com/33576079/132085565-a68877a6-1c3a-458e-900a-4e3b21574b3b.png)

![image](https://user-images.githubusercontent.com/33576079/132085580-b1d7f64f-7190-4491-9ad8-08a533668078.png)

![image](https://user-images.githubusercontent.com/33576079/132085584-1504d715-43dc-457c-8c6c-d3657b6b535d.png)


# Card note syntax

```
Issue title
issue text...
text...
text...
@assignee @assignee2 @assignee3
/label1 /label2 /label-with-spaces
```

You can also do as follows:

```
Issue title

issue text...
text...

text...

@assignee1
@assignee2
/label1
/label2
@assignee3 @assignee4
/label3 /label-with-spaces
```

## Assignee

Use GitHub login name, prefixed with `@`.

## Label

- Case-insensitive.
- Support non-ASCII characters.
- Spaces (` `) will be replaced with hyphen (`-`).

For example:

- `good first issue` -> `/good-first-issue`
- `AmAzing FeAture` -> `/amazing-feature`
- `日本語のラベル` -> `/日本語のラベル`


# Advanced options

| name | required | value | note |
| --- | --- | --- | --- |
| `token` | false | String | GitHub token. Default to `${{ github.token }}` |
| `assign_author` | false | `true` or `false` | Whether to assign the card author to the issue if no assignees are provided. Default to `false` |

For example:

```yaml
- uses: sarisia/actions-card-to-issue@v1
  with:
    token: ${{ secrets.ANOTHER_GITHUB_TOKEN }}
    assign_author: true
```

# FAQ

## Action fails with error `Resource not accessible by integration`

Permission not enough.

Easiest way to fix this is adding `permissions` to the workflow:

```yaml
name: convert project card to issue
on:
  project_card:
    types: [created]
permissions:
  issues: write
  repository-projects: write

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: sarisia/actions-card-to-issue@v1
```

You can also use your personal access token.
See [Advanced options](#advanced-options).


# Bugs? Requests?

Raising [Issues](https://github.com/sarisia/actions-card-to-issue/issues)
would be appreciated!
Providing [Step debug logs](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/enabling-debug-logging) really helps!
