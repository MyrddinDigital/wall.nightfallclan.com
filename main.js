let state = {
  posts: [],
  sortOrder: -1,
  numResults: null,
  userQuery: '',
  bodyQuery: '',
  isLoading: true
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
  methods: {
    getResults: () => {
      let apiUrl
      if (this.app) {
        apiUrl = `https://rbx-wall-api.herokuapp.com/85654/1?user=${this.app.userQuery}&body=${this.app.bodyQuery}&sortOrder=${this.app.sortOrder}`
        this.app.isLoading = true
      } else {
        apiUrl = `https://rbx-wall-api.herokuapp.com/85654/1`
      }
      

      axios.get(apiUrl)
      .then(response => {
        sanitizePostsResponse(response)
        this.app.posts = response.data.posts
        this.app.numResults = response.data.count
        this.app.isLoading = false
        })
        .catch(err => {
          throw new Error(err)
        })
    },
    changeSortOrder: () => {
      this.app.sortOrder = this.app.sortOrder*-1
      this.app.getResults()
    }
  }
})