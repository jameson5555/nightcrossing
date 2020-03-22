<template>
  <div id="app">
    <Crossword/>
  </div>
</template>

<script>
import Crossword from './components/Crossword.vue'

export default {
  name: 'App',
  components: {
    Crossword
  }
}
</script>

<style lang="scss">
html,
body {
    background: black;
    color: white;
}
ol {
    list-style-type: none;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  //margin-top: 60px;
}
.container {
    max-width: 100%;
}

@import'~bootstrap/dist/css/bootstrap.css';
@import url('https://fonts.googleapis.com/css?family=Exo:400,500,600,700,800&display=swap');
</style>
