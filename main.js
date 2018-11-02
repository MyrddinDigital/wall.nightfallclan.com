let state = {
  posts: null,
  query: null,
  umm: 'yep'
}

Vue.component('search-bar', {
  data ()  {
    return state
  },
  methods: {
    keyup: _event => {
      axios.get(`http://localhost:3000/85654/1?user=${this.app.query.toLowerCase()}`)
        .then(response => {
          console.log(response.data)
          this.app.posts = response.data
        })
        .catch(err => {
          throw new Error(err)
        })
    }
  },
  template: '<input type="text" v-model="query" @keyup="keyup" placeholder="Search for a user"/>'
})

var app = new Vue({
  el: '#vue-entry',
  data () {
    return state
  },
  mounted () {
    axios.get('http://localhost:3000/85654/1')
      .then(response => {
        this.posts = response.data
      })
      .catch(err => {
        throw new Error(err)
      })
  },
})