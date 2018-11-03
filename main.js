let state = {
  posts: [],
  sortOrder: 1,
  numResults: null,
  userQuery: '',
  bodyQuery: ''
}

function sanitizePostsResponse(response) {
  response.data.posts.forEach(post => {
    if (!post.poster) {
      post.poster = {
        user: {
          username: 'Banned User'
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
    axios.get(`https://rbx-wall-api.herokuapp.com/85654/1?sortOrder=${this.sortOrder}`)
      .then(response => {
        sanitizePostsResponse(response)
        this.posts = response.data.posts
        this.numResults = response.data.count
      })
      .catch(err => {
        throw new Error(err)
      })
  },
  methods: {
    getResults: () => {
      const apiUrl = `https://rbx-wall-api.herokuapp.com/85654/1?user=${this.app.userQuery}&body=${this.app.bodyQuery}&sortOrder=${this.app.sortOrder}`
      
      axios.get(apiUrl)
      .then(response => {
        sanitizePostsResponse(response)
        this.app.posts = response.data.posts
        this.app.numResults = response.data.count
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