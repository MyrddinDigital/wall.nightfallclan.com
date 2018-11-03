const state = {
  posts: [],
  sortOrder: -1,
  numResults: 0,
  userQuery: '',
  bodyQuery: '',
  isLoading: true,
  page: 1
}

function sanitizePostsResponse(response) {
  response.data.posts.forEach(post => {
    if (!post.poster) {
      post.poster = {
        user: {
          username: 'Banned User',
          userId: 1
        }
      }
    }
    post.body = post.body.linkify()
  })
}

var app = new Vue({
  el: '#vue-entry',
  data () {
    return state
  },
  mounted () {
    this.getResults()
  },
  computed: {
    numPages: () => {
      return Math.ceil(state.numResults/10)
    }
  },
  methods: {
    getResults: () => {
      const apiUrl = `https://rbx-wall-api.herokuapp.com/85654/${state.page}?user=${state.userQuery}&body=${state.bodyQuery}&sortOrder=${state.sortOrder}`
      state.isLoading = true

      axios.get(apiUrl)
      .then(response => {
        sanitizePostsResponse(response)
        state.posts = response.data.posts
        state.numResults = response.data.count
        state.isLoading = false
        })
        .catch(err => {
          throw new Error(err)
        })
    },
    changeSortOrder: () => {
      state.sortOrder = state.sortOrder*-1
      this.app.getResults()
    },
    prevPage: () => {
      if (!state.page > 1) return
      state.page--
      this.app.getResults()
    },
    nextPage: () => {
      if (!state.page < state.numPages) return
      state.page++
      this.app.getResults()
    }
  }
})