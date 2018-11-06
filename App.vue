<template>
<div>
  <h1 id="header">
  <a @click="reset">ROBLOX Wall Archive</a>
  </h1>
  <input type="text" v-model="userQuery" @keyup="page = 1" placeholder="Search for a user"/>
  <input type="text" v-model="bodyQuery" @keyup="page = 1" placeholder="Search for a specific post"/>
  <div id="resultsInfoContainer">
    <h3 v-if="numResults > 0 && !isLoading">showing {{ posts ? posts.length : 0 }} results of {{ numResults }}</h3>
    <h3 v-if="numResults == 0 && !isLoading">No results</h3>
    <button v-if="numResults > 0 && !isLoading" @click="page = 1; changeSortOrder()">Sort: {{ sortOrder == -1 ? 'New to old' : 'Old to new' }}</button>
  </div>
  <div v-if="!isLoading" v-for="post in posts" v-bind:key="post.id" v-bind:id="post.id" class="post" @click.self="getContext(post.id)">
    <a target="_blank" :href="`https://www.roblox.com/users/${post.poster.user.userId}/profile`">
      <img class="avatar" :src="`https://www.roblox.com/headshot-thumbnail/image?userId=${post.poster.user.userId}&width=420&height=420&format=png`">
    </a>
    <p class="postContainer">
      <a @click="searchUser(post.poster.user.username)">{{ post.poster.user.username }}</a>
      <br><br>
      <span @click.self="getContext(post.id)" v-html="post.body"></span>
      <br><br>
      <span @click.self="getContext(post.id)" class="date">{{ new Date(post.created).toLocaleString('en-US') }}</span>
    </p>
  </div>
  <div v-if="isLoading" style="margin-top: 60px"></div>
  <div v-if="isLoading" v-for="n in 10" v-bind:key="n" class="post">
    <facebook-loader></facebook-loader>
  </div>
  <div v-if="numResults > 0 && !isLoading" id="pageNavigation">
    <h5>Page {{ page }} of {{ numPages }}</h5>
    <button @click="prevPage" v-if="page > 1">Prev Page</button>
    <button @click="nextPage" v-if="numPages > page">Next Page</button>
  </div>
</div>
</template>

<script>
  const apiOrigin = (
    window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rbx-wall-api.herokuapp.com'
  )

  const state = {
    sortOrder: -1,
    numResults: 0,
    userQuery: '',
    bodyQuery: '',
    isLoading: true,
    page: 1,
    spotlightMsg: null
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

  import axios from 'axios'
  import { FacebookLoader } from "vue-content-loader"

  export default {
    data () {
      return state
    },
    components: {
      FacebookLoader
    },
    computed: {
      numPages () {
        return Math.ceil((state.numResults/10))
      }
    },
    updated () {
      if (state.spotlightMsg) {
        const msg = document.getElementById(state.spotlightMsg)
        msg.scrollIntoView({behavior: 'smooth', block: 'center'})
        msg.classList.add('flash')

        setTimeout(() => {
          state.spotlightMsg = null
        }, 500)
      }
    },
    asyncComputed: {
      posts () {
        const apiUrl = `${apiOrigin}/85654/${state.page}?user=${state.userQuery}&body=${state.bodyQuery}&sortOrder=${state.sortOrder}`
        state.isLoading = true

        const userQueryAtTheTime = state.userQuery
        const bodyQueryAtTheTime = state.bodyQuery

        return new Promise((resolve, reject) => {
          axios.get(apiUrl)
            .then(response => {
              if (state.userQuery === userQueryAtTheTime && state.bodyQuery === bodyQueryAtTheTime) {
                sanitizePostsResponse(response)
                state.numResults = response.data.count
                state.isLoading = false
                resolve(response.data.posts)
                mixpanel.track('Results returned')
              } else {
                reject()
              }
            })
            .catch(err => {
              reject(err)
            })
        })
      }
    },
    methods: {
      submit (e) {
        console.log(e.target.value)
      },
      changeSortOrder () {
        state.sortOrder = state.sortOrder*-1
      },
      searchUser (user) {
        state.page = 1
        state.userQuery = user
        document.body.scrollTop = document.documentElement.scrollTop = 0
      },
      prevPage () {
        if (!state.page > 1) return
        state.page--
      },
      nextPage () {
        if (!state.page < state.numPages) return
        state.page++
      },
      getContext (id) {
        state.isLoading = true
        const apiUrl = `${apiOrigin}/85654?getContext=${id}&sortOrder=${state.sortOrder}`

        axios.get(apiUrl)
          .then(response => {
            state.page = response.data.page
            state.sortOrder = -1
            state.userQuery = ''
            state.bodyQuery = ''
            state.spotlightMsg = id
          })
          .catch(err => {
            throw new Error(err)
          })
      },
      reset () {
        state.page = 1
        state.sortOrder = -1
        state.userQuery = ''
        state.bodyQuery = ''
        state.spotlightMsg = null
      }
    }
  }
</script>

<style>
html {
  font-family: Arial, Helvetica, sans-serif;
  overflow-y: overlay;
}

* {
  transition: all 200ms;
}

html input:focus, html button:focus {
  outline: none;
  box-shadow: #7dcdea52 0 0 0px 4px;
}

a {
  cursor: pointer;
}

a, a:hover {
  text-decoration: none;
  color: #00aef4;
  font-weight: bold;
}

h3, input, .post {
  display: block;
  margin: 10px auto;
  width: 500px;
  padding: 10px;
  border: 2px solid #eeeeee;
}

h3 {
  text-align: center;
  color: gray;
  border: none;
  display: inline;
}

input {
  border-radius: 20px;
  border-color: #7ecae9;
}

#header {
  text-align: center;
}

.post, .flashPost {
  border-radius: 10px;
  cursor: pointer;
}

.date {
  font-size: 0.7em;
}

.avatar {
  width: 75px;
  height: 75px;
  margin: 5px 20px 5px 5px;
  float: left;
  border: 1px solid #dddddd;
  border-radius: 100%;
}

#resultsInfoContainer {
  text-align: center;
  margin: 20px 0 0 10px;
}

.postContainer {
  display: table;
}

button {
  cursor: pointer;
  position: relative;
  top: -4px;
  font-weight: bold;
  color: white;
  border: 2px solid #00aef4;
  border-radius: 5px;
  width: 150px;
  height: 30px;
  line-height: 15px;
  background: #00aef4;
}

button:hover {
  color: #00aef4;
  background: white;
}

#pageNavigation {
  text-align: center;
  margin: 20px;
}

@keyframes flash {
  0% {
    border-color: #eeeeee;
  }
  50% {
    border-color: #ffe600;
  }
  100% {
    border-color: #eeeeee;
  }
}

.flash {
  animation: 0.75s ease-in-out 0s 2 flash;
}
</style>

