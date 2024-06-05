// Adapted from https://raw.githubusercontent.com/EmilTholin/svelte-routing/master/src/history.js

const getLocation = source => {
  return {
    ...source.location,
    state: source.history.state,
    key: (source.history.state && source.history.state.key) || "initial",
  }
}

const createHistory = source => {
  const listeners = []
  let location = getLocation(source)

  return {
    get location() {
      return location
    },

    listen(listener) {
      listeners.push(listener)

      const popstateListener = () => {
        location = getLocation(source)
        listener({location, action: "POP"})
      }

      source.addEventListener("popstate", popstateListener)

      return () => {
        source.removeEventListener("popstate", popstateListener)
        const index = listeners.indexOf(listener)
        listeners.splice(index, 1)
      }
    },

    navigate(
      to,
      {state = {}, replace = false, preserveScroll = false, blurActiveElement = true} = {},
    ) {
      // try...catch iOS Safari limits to 100 pushState calls
      try {
        if (replace) source.history.replaceState(state, "", to)
        else source.history.pushState(state, "", to)
      } catch (e) {
        source.location[replace ? "replace" : "assign"](to)
      }
      location = getLocation(source)
      listeners.forEach(listener => listener({location, action: "PUSH", preserveScroll}))

      // @ts-ignore
      if (blurActiveElement) document.activeElement.blur()
    },
  }
}

// Stores history entries in memory for testing or other platforms like Native
const createMemorySource = (initialPathname = "/") => {
  let index = 0
  const stack = [{pathname: initialPathname, search: ""}]
  const states = []

  return {
    get location() {
      return stack[index]
    },
    addEventListener(name, fn) {},
    removeEventListener(name, fn) {},
    history: {
      get entries() {
        return stack
      },
      get index() {
        return index
      },
      get state() {
        return states[index]
      },
      pushState(state, _, uri) {
        const [pathname, search = ""] = uri.split("?")
        index++
        stack.push({pathname, search})
        states.push(state)
      },
      replaceState(state, _, uri) {
        const [pathname, search = ""] = uri.split("?")
        stack[index] = {pathname, search}
        states[index] = state
      },
    },
  }
}
// Global history uses window.history as the source if available,
// otherwise a memory history
const globalHistory = createHistory(window)
const {navigate} = globalHistory

export {globalHistory, navigate, createHistory, createMemorySource}
