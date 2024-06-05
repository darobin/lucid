import {partition, prop, uniqBy} from "ramda"
import {batch} from "hurdak"
import {writable} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {
  Tags,
  getIdOrAddress,
  getIdAndAddress,
  getIdFilters,
  isContextAddress,
  LOCAL_RELAY_URL,
  DIRECT_MESSAGE,
  REACTION,
} from "@welshman/util"
import {Tracker} from "@welshman/net"
import type {Feed, Loader, RequestItem} from "@welshman/feeds"
import {walkFeed, FeedLoader as CoreFeedLoader} from "@welshman/feeds"
import {noteKinds, isLike, reactionKinds, repostKinds} from "src/util/nostr"
import {isAddressFeed} from "src/domain"
import type {DisplayEvent} from "src/engine"
import {
  feedLoader as baseFeedLoader,
  sortEventsDesc,
  unwrapRepost,
  isEventMuted,
  repository,
  hints,
  forcePlatformRelays,
  forcePlatformRelaySelections,
  addRepostFilters,
  getFilterSelections,
  subscribe,
  tracker,
  load,
} from "src/engine"

export type FeedOpts = {
  feed?: Feed
  anchor?: string
  skipCache?: boolean
  skipNetwork?: boolean
  skipPlatform?: boolean
  shouldDefer?: boolean
  shouldListen?: boolean
  shouldHideReplies?: boolean
  shouldLoadParents?: boolean
  includeReposts?: boolean
  onEvent?: (e: TrustedEvent) => void
}

export class FeedLoader {
  done = writable(false)
  loader: Promise<Loader>
  compiled?: Promise<RequestItem[]>
  feedLoader: CoreFeedLoader<TrustedEvent>
  controller = new AbortController()
  notes = writable<DisplayEvent[]>([])
  parents = new Map<string, DisplayEvent>()
  reposts = new Map<string, TrustedEvent[]>()
  replies = new Map<string, TrustedEvent[]>()
  isEventMuted = isEventMuted.get()

  constructor(readonly opts: FeedOpts) {
    function* getRequestItems({relays, filters}) {
      // Default to note kinds
      filters = filters?.map(filter => ({kinds: noteKinds, ...filter})) || []

      // Add reposts if we don't have any authors specified
      if (opts.includeReposts && !filters.some(f => f.authors?.length > 0)) {
        filters = addRepostFilters(filters)
      }

      // Use relays specified in feeds
      if (relays?.length > 0) {
        yield {filters, relays}
      } else {
        if (!opts.skipCache) {
          yield {filters, relays: [LOCAL_RELAY_URL]}
        }

        if (!opts.skipNetwork) {
          let selections = getFilterSelections(filters)

          if (!opts.skipPlatform) {
            selections = forcePlatformRelaySelections(selections)
          }

          for (const {relay, filters} of selections) {
            yield {filters, relays: [relay]}
          }
        }
      }
    }

    // Use a custom feed loader so we can intercept the filters and infer relays
    this.feedLoader = new CoreFeedLoader({
      ...baseFeedLoader.options,
      request: async ({relays, filters, onEvent}) => {
        const tracker = new Tracker()
        const signal = this.controller.signal

        await Promise.all(
          Array.from(getRequestItems({relays, filters})).map(opts =>
            load({...opts, onEvent, tracker, signal, skipCache: Boolean(relays)}),
          ),
        )
      },
    })

    this.compiled = this.feedLoader.compiler.canCompile(opts.feed)
      ? this.feedLoader.compiler.compile(opts.feed)
      : null

    if (opts.shouldListen && this.compiled) {
      this.compiled.then(requests => {
        const tracker = new Tracker()
        const signal = this.controller.signal
        const onEvent = this.onEvent(this.prependToFeed)

        for (const {relays, filters} of requests) {
          for (const request of Array.from(getRequestItems({relays, filters}))) {
            subscribe({...request, onEvent, tracker, signal, skipCache: opts.skipCache})
          }
        }
      })
    }
  }

  // Public api

  start = () => {
    const loadOpts = {
      onEvent: this.onEvent(this.appendToFeed),
      onExhausted: () => {
        this.done.set(true)
      },
    }

    this.loader = this.compiled
      ? this.compiled.then(requests => this.feedLoader.getRequestsLoader(requests, loadOpts))
      : this.feedLoader.getLoader(this.opts.feed, loadOpts)
  }

  stop = () => {
    this.controller.abort()
  }

  subscribe = f => this.notes.subscribe(f)

  load = (limit: number) => this.loader.then(loader => loader(limit))

  // Event selection, deferral, and parent loading

  onEvent = cb =>
    batch(300, async events => {
      if (this.controller.signal.aborted) {
        return
      }

      const keep = this.discardEvents(events)

      if (this.opts.shouldLoadParents) {
        this.loadParents(keep)
      }

      const ok = this.deferOrphans(keep)

      cb(ok)
    })

  discardEvents = events => {
    let strict = true

    // Be more tolerant when looking at communities
    walkFeed(this.opts.feed, feed => {
      if (isAddressFeed(feed)) {
        strict = strict && !(feed.slice(2) as string[]).some(isContextAddress)
      }
    })

    return events.filter(e => {
      if (repository.isDeleted(e)) return false
      if (e.kind === REACTION && !isLike(e)) return false
      if ([4, DIRECT_MESSAGE].includes(e.kind)) return false
      if (this.isEventMuted(e, strict)) return false
      if (this.opts.shouldHideReplies && Tags.fromEvent(e).parent()) return false
      if (getIdOrAddress(e) === this.opts.anchor) return false

      return true
    })
  }

  loadParents = notes => {
    // Add notes to parents too since they might match
    for (const e of notes) {
      for (const k of getIdAndAddress(e)) {
        this.parents.set(k, e)
      }
    }

    const notesWithParent = notes.filter(e => {
      if (repostKinds.includes(e.kind)) {
        return false
      }

      if (this.isEventMuted(e)) {
        return false
      }

      const ids = Tags.fromEvent(e).parents().values().valueOf()

      if (ids.length === 0 || ids.some(k => this.parents.has(k))) {
        return false
      }

      return true
    })

    const {signal} = this.controller
    const selections = hints.merge(notesWithParent.map(hints.EventParents)).getSelections()

    for (const {relay, values} of selections) {
      load({
        filters: getIdFilters(values),
        signal: this.controller.signal,
        relays: this.opts.skipPlatform ? [relay] : forcePlatformRelays([relay]),
        onEvent: batch(100, async events => {
          if (signal.aborted) {
            return
          }

          for (const e of this.discardEvents(events)) {
            for (const k of getIdAndAddress(e)) {
              this.parents.set(k, e)
            }
          }
        }),
      })
    }
  }

  deferOrphans = (notes: TrustedEvent[]) => {
    if (!this.opts.shouldLoadParents || this.opts.shouldDefer === false) {
      return notes
    }

    // If something has a parent id but we haven't found the parent yet, skip it until we have it.
    const [ok, defer] = partition(e => {
      const parents = Tags.fromEvent(e).parents().values().valueOf()

      return parents.length === 0 || parents.some(k => this.parents.has(k))
    }, notes)

    const {signal} = this.controller

    setTimeout(() => {
      if (!signal.aborted) {
        this.appendToFeed(defer)
      }
    }, 3000)

    return ok
  }

  // Feed building

  appendToFeed = (notes: TrustedEvent[]) => {
    this.notes.update($notes => uniqBy(prop("id"), [...$notes, ...this.buildFeedChunk(notes)]))
  }

  prependToFeed = (notes: TrustedEvent[]) => {
    this.notes.update($notes => uniqBy(prop("id"), [...this.buildFeedChunk(notes), ...$notes]))
  }

  buildFeedChunk = (notes: TrustedEvent[]) => {
    const seen = new Set(this.notes.get().map(getIdOrAddress))
    const parents = []

    // Sort first to make sure we get the latest version of replaceable events, then
    // after to make sure notes replaced by their parents are in order.
    return sortEventsDesc(
      uniqBy(
        prop("id"),
        sortEventsDesc(notes)
          .map((e: TrustedEvent) => {
            // If we have a repost, use its contents instead
            if (repostKinds.includes(e.kind)) {
              const wrappedEvent = unwrapRepost(e)

              if (wrappedEvent) {
                const reposts = this.reposts.get(wrappedEvent.id) || []

                this.reposts.set(wrappedEvent.id, [...reposts, e])

                tracker.copy(e.id, wrappedEvent.id)

                e = wrappedEvent
              }
            }

            // If we have a parent, show that instead, with replies grouped underneath
            while (true) {
              const parentIds = Tags.fromEvent(e).parents().values().valueOf()

              if (parentIds.length === 0) {
                break
              }

              // Keep track of replies
              for (const parentId of parentIds) {
                const replies = this.replies.get(parentId) || []
                if (!replies.some(r => r.id === e.id)) {
                  this.replies.set(parentId, [...replies, e])
                }
              }

              const parentId = parentIds.find(id => this.parents.get(id))

              if (!parentId) {
                break
              }

              e = this.parents.get(parentId)
            }

            return e
          })
          .concat(parents)
          // If we've seen this note or its parent, don't add it again
          .filter(e => {
            if (seen.has(getIdOrAddress(e))) return false
            if (repostKinds.includes(e.kind)) return false
            if (reactionKinds.includes(e.kind)) return false

            seen.add(getIdOrAddress(e))

            return true
          })
          .map((e: DisplayEvent) => {
            e.replies = getIdAndAddress(e).flatMap(k => this.replies.get(k) || [])
            e.reposts = getIdAndAddress(e).flatMap(k => this.reposts.get(k) || [])

            return e
          }),
      ),
    )
  }
}
