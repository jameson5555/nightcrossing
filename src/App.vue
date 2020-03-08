<template>
  <div id="app">
    <CrosswordList/>
    <Crossword/>
  </div>
</template>

<script>
import CrosswordList from './components/CrosswordList.vue'
import Crossword from './components/Crossword.vue'

export default {
  name: 'App',
  components: {
    CrosswordList,
    Crossword
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
