import {fromPairs, randomId} from "@welshman/lib"
import {FEED, Tags, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {
  feedFromTags,
  makeIntersectionFeed,
  hasSubFeeds,
  isTagFeed,
  isAuthorFeed,
  isScopeFeed,
} from "@welshman/feeds"
import type {Feed as IFeed} from "@welshman/feeds"
import {SearchHelper} from "src/util/misc"
import {tryJson} from "src/util/misc"
import type {List} from "./list"

export type Feed = {
  title: string
  identifier: string
  description: string
  definition: IFeed
  event?: TrustedEvent
  list?: List
}

export const normalizeFeedDefinition = feed =>
  hasSubFeeds(feed) ? feed : makeIntersectionFeed(feed)

export const makeFeed = (feed: Partial<Feed> = {}): Feed => ({
  title: "",
  description: "",
  identifier: randomId(),
  definition: makeIntersectionFeed(),
  ...feed,
})

export const mapListToFeed = (list: List) =>
  makeFeed({
    list,
    title: list.title,
    identifier: list.identifier,
    description: list.description,
    definition: feedFromTags(Tags.fromEvent(list.event)),
  })

export const readFeed = (event: TrustedEvent) => {
  const {d: identifier, title = "", description = "", feed = ""} = fromPairs(event.tags)
  const definition = tryJson(() => JSON.parse(feed)) || makeIntersectionFeed()

  return {title, identifier, description, definition, event} as Feed
}

export const createFeed = ({identifier, definition, title, description}: Feed) => ({
  kind: FEED,
  tags: [
    ["d", identifier],
    ["title", title],
    ["description", description],
    ["feed", JSON.stringify(definition)],
  ],
})

export const editFeed = (feed: Feed) => ({
  kind: FEED,
  tags: Tags.fromEvent(feed.event)
    .setTag("title", feed.title)
    .setTag("description", feed.description)
    .setTag("feed", JSON.stringify(feed.definition))
    .unwrap(),
})

export const displayFeed = (feed?: Feed) => feed?.title || "[no name]"

export class FeedSearch extends SearchHelper<Feed, string> {
  config = {keys: ["title", "description"]}
  getValue = (option: Feed) => getAddress(option.event)
  display = (address: string) =>
    displayFeed(this.options.find(feed => this.getValue(feed) === address))
}

export const isTopicFeed = f => isTagFeed(f) && f[1] === "#t"

export const isMentionFeed = f => isTagFeed(f) && f[1] === "#p"

export const isAddressFeed = f => isTagFeed(f) && f[1] === "#a"

export const isPeopleFeed = f => isAuthorFeed(f) || isScopeFeed(f)
