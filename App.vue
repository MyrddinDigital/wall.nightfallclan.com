<template>
<div>
  <div id="sidebar">
    <img class="groupPicker" src="https://t3.rbxcdn.com/888cf08084161f379ef2c13da25c8b92" @click="changeGid(85654)">
    <img class="groupPicker" src="https://t2.rbxcdn.com/4b27b485b47adb7c6a9403367089230d" @click="changeGid(80738)">
    <img class="groupPicker" src="https://t3.rbxcdn.com/f3cfe7940b1fdd9b3cf1f195aa86fe7c" @click="changeGid(18)">
  </div>
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
  <vue-loading v-if="isLoading" type="spin" color="#75787c" :size="{ width: '50px', height: '50px' }"></vue-loading>
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
    gid: 85654,
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
  import { VueLoading } from 'vue-loading-template'

  export default {
    data () {
      return state
    },
    components: {
      VueLoading
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
        const apiUrl = `${apiOrigin}/${state.gid}/${state.page}?user=${state.userQuery}&body=${state.bodyQuery}&sortOrder=${state.sortOrder}`
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
        const apiUrl = `${apiOrigin}/${state.gid}?getContext=${id}&sortOrder=${state.sortOrder}`

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
      changeGid(gid) {
        state.gid = gid
        state.page = 1
        state.spotlightMsg = null
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

<style lang="scss">
$lightGray: #484b51;
$medGray: #2f3136;
$darkGray: #202225;
$lightText: #cfcfcf;
$medText: #75787c;
$grayAccent: #3e4147;
$blue: #64a3d6;

html {
  font-family: Arial, Helvetica, sans-serif;
  overflow-y: overlay;
}

body {
  background: $medGray;
}

* {
  transition: all 200ms;
  color: $lightText;
}

html input:focus, html button:focus {
  outline: none;
  // box-shadow: #7dcdea52 0 0 0px 4px;
}

a {
  cursor: pointer;
}

a, a:hover {
  text-decoration: none;
  color: $blue;
  font-weight: bold;
}

h3, input, .post {
  display: block;
  margin: 10px auto;
  width: 500px;
  padding: 10px;
  border: 2px solid $grayAccent;
}

h3 {
  text-align: center;
  color: $lightText;
  border: none;
  display: inline;
}

input {
  border-radius: 5px;
  border: 1px solid $grayAccent;
  background: $lightGray;
  color: $medText;
}

#header {
  text-align: center;
}

.post, .flashPost {
  border-radius: 10px;
  cursor: pointer;
  border-radius: 0px;
  border-width: 0 0 1px 0;
}

.date {
  font-size: 0.7em;
}

.avatar {
  width: 75px;
  height: 75px;
  margin: 5px 20px 5px 5px;
  float: left;
  border: 1px solid $grayAccent;
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
  color: $lightText;
  border: 2px solid $blue;
  border-radius: 5px;
  width: 150px;
  height: 30px;
  line-height: 15px;
  background: $blue;
}

button:hover {
  color: $blue;
  background: $medGray;
}

#pageNavigation {
  text-align: center;
  margin: 20px;
}

#sidebar {
  height: 100%;
  width: 50px;
  border-right: 1px solid $grayAccent;
  position: fixed;
  top: 0;
  left: 0;
  padding: 10px;
  background: $darkGray;
}

.groupPicker {
  width: 50px;
  height: 50px;
  display: block;
  margin: 10px 0;
  cursor: pointer;
}

.groupPicker:first-child  {
  margin-top: 0px;
}

@keyframes flash {
  0% {
    border-color: $grayAccent;
  }
  50% {
    border-color: #ffe600;
  }
  100% {
    border-color: $grayAccent;
  }
}

.flash {
  animation: 0.75s ease-in-out 0s 2 flash;
}
</style>

