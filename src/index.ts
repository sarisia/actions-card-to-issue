import * as core from '@actions/core'
import * as github from '@actions/github'

const lineBreakRe = /\r?\n/
const whitespaceRe  = / /g

let labelsCache: {[k: string]: string} | null = null
let octokit: ReturnType<typeof github.getOctokit>

async function run() {
    core.debug(`========== github.context.payload:\n${JSON.stringify(github.context.payload, null, 4)}`)

    // check action
    // is the triggered action is project_card.create or converted?
    const actionType = github.context.payload.action
    if (actionType !== "created" && actionType !== "converted") {
        core.setFailed(`unsupported trigger action: ${actionType}. See README and fix your workflow.`)
        return
    }

    // init configuration
    const optAssignAuthor = core.getBooleanInput("assign_author")
    const optToken = core.getInput("token").trim()
    if (optToken === "") {
        core.setFailed("GitHub token is not provided. See README and fix your workflow.")
        return
    }

    // init client
    octokit = github.getOctokit(optToken)

    // handle body
    let rawNote: string | null = null
    if (actionType === "created") {
        rawNote = github.context.payload.project_card?.note
    } else if (actionType === "converted") {
        rawNote = github.context.payload.changes?.note?.from
    }
    core.debug(`========== rawNote:\n${rawNote}`)

    // if note is missing, or empty string (""), make error
    if (!rawNote) {
        core.setFailed("card's note is missing, or empty")
        return
    }

    // we do update lines implace now, but if this is problematic
    // we can keep the original lines
    let lines = rawNote.split(lineBreakRe)

    // find first non-empty line, use them as the title
    lines = trimLeadingEmptyLines(lines)
    const pTitle = lines.shift()
    if (!pTitle) {
        core.setFailed("title is required for issues")
        return
    }    

    // reading fron trailing, check label line & assignee line
    lines = trimTrailingEmptyLines(lines)

    const pAssignees: string[] = []
    const pLabels: string[] = []
    {
        let i = lines.length-1
        for (;i >= 0; --i) {
            if (lines[i].startsWith("/")) {
                // label
                const labels = await getLabelsFromLine(lines[i])
                if (labels.length) {
                    pLabels.push(...labels)
                } else {
                    // did not got label, treat this line as normal text
                    // also, stop searching options
                    break
                }
            } else if (lines[i].startsWith("@")) {
                // assignee
                const assignees = getAssigneesFromLine(lines[i])
                if (assignees.length) {
                    pAssignees.push(...assignees)
                } else {
                    break
                }
            } else {
                break
            }
        }

        lines = lines.slice(0, i+1)
    }

    // if assignees are empty, populate author
    if (!pAssignees.length && optAssignAuthor) {
        const author = github.context.actor
        pAssignees.push(author)
        core.info(`no assignees in card and option \`assign_author\` is set. Populating card author \`${author}\`...`)
    }

    // finally, crean lines and use them as body
    lines = trimLeadingEmptyLines(lines)
    lines = trimTrailingEmptyLines(lines)
    const pBody = lines.join("\n")

    // data are ready, debug print
    core.debug("========== parsed data:")
    core.debug(`title: ${pTitle}`)
    core.debug(`assignees: ${pAssignees}`)
    core.debug(`labels: ${pLabels}`)
    core.debug(`body: ${pBody}`)

    let issueId: number | null = null
    if (actionType === "created") {
        // if trigger is `created`, convert card to issue, get issue id
        try {
            const { convertProjectCardNoteToIssue: resp } = await octokit.graphql(
                `mutation($input: ConvertProjectCardNoteToIssueInput!) {
                    convertProjectCardNoteToIssue(input: $input) {
                        projectCard {
                            content {
                                ...on Issue {
                                    number
                                }
                            }
                        }
                    }
                }`,
                {
                    input: {
                        repositoryId: github.context.payload.repository?.node_id,
                        projectCardId: github.context.payload.project_card?.node_id,
                        title: pTitle,
                        body: pBody
                    }
                }
            )
            core.debug(`========== octokit.graphql (convertProjectCardNoteToIssue):\n${JSON.stringify(resp, null, 4)}`)

            issueId = resp.projectCard?.content?.number
            core.info(`converted the card to the issue successfully: #${issueId}`)
        } catch (e) {
            core.setFailed(`failed to convert card to issue: ${e}`)
            return
        }
    } else if (actionType === "converted") {
        // if trigger is `converted`, we need to fetch project_card with graphql since webhook event
        // does not contains information about newly created issue
        try {
            const { node: card } = await octokit.graphql(
                `query($cardId: ID!) {
                    node(id: $cardId) {
                        ... on ProjectCard {
                            content {
                                ... on Issue {
                                    number
                                }
                            }
                        }
                    }
                }`,
                {
                    cardId: github.context.payload.project_card?.node_id
                }
            )
            core.debug(`========== octokit.graphql (query node):\n${JSON.stringify(card, null, 4)}`)

            issueId = card.content?.number
        } catch (e) {
            core.setFailed(`failed to get information of converted issue: ${e}`)
            return
        }
    }
    
    // check issue
    if (issueId == null || (typeof issueId) !== "number") {
        core.setFailed(`failed to get issueId`)
        return
    }
    core.info(`new issue number: #${issueId}`)

    // assign authors and set labels
    try {
        const { owner, repo } = github.context.repo
        const req: any = {
            owner,
            repo,
            issue_number: issueId,
            assignees: pAssignees,
            labels: pLabels
        }
        if (actionType === "converted") {
            // we need to modify body here
            req.body = pBody
        }

        const ret = await octokit.rest.issues.update(req)
        core.debug(`========== octokit.rest.issues.update:\n${JSON.stringify(ret, null, 4)}`)
    } catch(e) {
        core.setFailed(`failed to set labels and assignees to issue: ${e}`)
        return
    }
    core.info("Issue updated successfully")

    core.info("Done!")
}

function getAssigneesFromLine(line: string): string[] {
    const ret: string[] = []

    // we only check prefix
    // TODO: treat the username without trailing space as the issue body
    // ex. @sarisiaお前の仕事
    const logins = line.trim().split(" ")
    for (const l of logins) {
        if (!l) {
            // skip empty string ""
            // this may happen when commands like "@sarisia     @neuenmuller"
            continue
        }
        if (!l.startsWith("@")) {
            // invalid syntax, maybe this is normal text line?
            return []
        }
        ret.push(l.substring(1))
    }

    return ret
}

async function getLabelsFromLine(line: string): Promise<string[]> {
    const ret: string[] = []

    // if labels is not fetched (cached), do it
    if (labelsCache === null) {
        labelsCache = {}
        const { owner, repo } = github.context.repo
        try {
            const { data: labels } = await octokit.rest.issues.listLabelsForRepo({
                owner,
                repo
            })
            core.debug(`========== octokit.rest.issues.listLabelsForRepo:\n${JSON.stringify(labels, null, 4)}`)

            for (const l of labels) {
                labelsCache[l.name.toLowerCase().replace(whitespaceRe, "-")] = l.name
            }
        } catch (e) {
            // this is not fatal, so continue
            core.warning(`failed to get labels from API: ${e}`)
            return []
        }

        core.debug(`========== cached labels:`)
        for (const key in labelsCache) {
            core.debug(`${key}: ${labelsCache[key]}`)
        }
    }

    const labels = line.trim().split(" ")
    for (const l of labels) {
        if (!l) {
            // skip empty string ""
            // this may happen when commands like "/bug      /prod"
            continue
        }
        if (!l.startsWith("/")) {
            // invalid syntax, maybe this is normal text line?
            return []
        }

        // check label set
        const canoLabel = l.substring(1).toLowerCase()
        if (canoLabel in labelsCache) {
            ret.push(labelsCache[canoLabel])
        }
    }

    return ret
}

function trimLeadingEmptyLines(lines: string[]): string[] {
    let startIdx = 0;
    // find start
    for (; lines[startIdx] === ""; ++startIdx) { }
    return lines.slice(startIdx)
}

function trimTrailingEmptyLines(lines: string[]): string[] {
    let endIdx = lines.length - 1;
    // find end
    for (; lines[endIdx] === ""; --endIdx) { };
    return lines.slice(0, endIdx + 1)
}


try {
    run()
} catch (e) {
    core.setFailed(`unhandled error: ${e}`)
}
