let state = {
  posts: [],
  userQuery: null,
  bodyQuery: null
}

function sanitizePostsResponse(response) {
  response.data.forEach(post => {
    if (!post.poster) {
      post.poster = {
        user: {
          username: 'Banned User'
        }
      }
    }
  })
}

Vue.component('user-search', {
  data ()  {
    return state
  },
  methods: {
    keyup: _event => {
      const apiUrl = this.app.bodyQuery ? 
        `https://rbx-wall-api.herokuapp.com/85654/1?user=${this.app.userQuery.toLowerCase()}&body=${this.app.bodyQuery.toLowerCase()}`:
        `https://rbx-wall-api.herokuapp.com/85654/1?user=${this.app.userQuery.toLowerCase()}`

      axios.get(apiUrl)
        .then(response => {
          sanitizePostsResponse(response)
          this.app.posts = response.data
        })
        .catch(err => {
          throw new Error(err)
        })
    }
  },
  template: '<input type="text" v-model="userQuery" @keyup="keyup" placeholder="Search for a user"/>'
})

Vue.component('body-search', {
  data ()  {
    return state
  },
  methods: {
    keyup: _event => {
      const apiUrl = this.app.userQuery ? 
        `https://rbx-wall-api.herokuapp.com/85654/1?user=${this.app.userQuery.toLowerCase()}&body=${this.app.bodyQuery.toLowerCase()}`:
        `https://rbx-wall-api.herokuapp.com/85654/1?body=${this.app.bodyQuery.toLowerCase()}`

      axios.get(apiUrl)
        .then(response => {
          sanitizePostsResponse(response)
          this.app.posts = response.data
        })
        .catch(err => {
          throw new Error(err)
        })
    }
  },
  template: '<input type="text" v-model="bodyQuery" @keyup="keyup" placeholder="Search for a specific post"/>'
})

var app = new Vue({
  el: '#vue-entry',
  data () {
    return state
  },
  mounted () {
    axios.get('https://rbx-wall-api.herokuapp.com/85654/1')
      .then(response => {
        sanitizePostsResponse(response)
        this.posts = response.data
      })
      .catch(err => {
        throw new Error(err)
      })
  },
})