import Vue from 'vue'
import App from './App.vue'
import AsyncComputed from 'vue-async-computed'

Vue.use(AsyncComputed)

new Vue({
  el: '#vue-entry',
  render: h => h(App)
})