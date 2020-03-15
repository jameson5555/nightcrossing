<template>
	<div class="crossword container">
		<h1>Today's Crossword:<br/>{{ data.title }}</h1>
		<p>{{ data.dow }}<br/>By: {{ data.author }}<br/><small>&copy; {{ data.copyright }}</small></p>

		<div class="crossword__clues clues row text-left">
			<ol class="clues__across col-6">
				<li><strong>Across</strong></li>
				<li v-for="(clue, index) in cluesAcross" :key="index"><span v-html="clue"></span></li>
			</ol>
			<ol class="clues__down col-6">
				<li><strong>Down</strong></li>
				<li v-for="(clue, index) in cluesDown" :key="index"><span v-html="clue"></span></li>
			</ol>
		</div>
	</div>
</template>

<script>
import $ from 'jquery'

export default {
	name: 'Crossword',
	data() {
		return {
			data: {},
			cluesAcross: [],
			cluesDown: []
		}
	},
	methods: {
		getCrosswords() {
			console.log('start function')
			$.getJSON("https://www.xwordinfo.com/JSON/Data.aspx?callback=?", { date: 'current' }, result => {
				this.data = result
				this.cluesAcross = result.clues.across
				this.cluesDown = result.clues.down
				console.log('data:', result)
			})

		}
	},
	mounted() {
		this.getCrosswords()
	}
}
</script>
