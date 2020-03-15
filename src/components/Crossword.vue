<template>
	<div class="crossword container">
		<h1>Today's Crossword:<br/>{{ data.title }}</h1>
		<p>{{ data.dow }}<br/>By: {{ data.author }}<br/><small>&copy; {{ data.copyright }}</small></p>

		<div class="crossword__grid mb-3">
			<div class="grid" :style="'grid-template-columns: ' + columnStyle + ';'">
				<div 
					v-for="(letter, index) in data.grid" 
					:key="index" 
					class="grid__square square">
					<div v-if="letter === '.'" class="square__inner square__inner--blank"></div>
					<div v-else class="square__inner square__inner--full">
						<input 
							type="text" 
							:data-answer="letter" 
							:placeholder="letter" 
							class="square__letter"
						/>
						<span v-if="data.gridnums[index] !== 0" class="square__number">{{data.gridnums[index]}}</span>
					</div>
				</div>
			</div>
		</div>

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
			cluesDown: [],
			columnStyle: ''
		}
	},
	methods: {
		getCrosswords() {
			console.log('start function')
			$.getJSON("https://www.xwordinfo.com/JSON/Data.aspx?callback=?", { date: 'current' }, result => {
				this.data = result
				this.cluesAcross = result.clues.across
				this.cluesDown = result.clues.down
				this.columnStyle;

				for (var index = 0; index < result.size.cols; index++) {
					this.columnStyle = this.columnStyle + 'auto '
				}
				console.log('data:', result)
			})

		}
	},
	mounted() {
		this.getCrosswords()
	}
}
</script>

<style lang="scss">
	.grid {
		display: grid;
		grid-gap: 1px;
	}
	.square {
		color: orange;
		font-size: 2vw;
		height: 0;
		padding-bottom: 100%;
		position: relative;
		&__inner {
			position: absolute;
			top: 0;
			right: 0;
			bottom: 0;
			left: 0;
			&--blank {
				background: black;
			}
			&--full {
				background: white;
			}
		}
		&__letter {
			width: 100%;
			height: 100%;
			overflow: hidden;
			border: none;
			box-shadow: none;
			text-align: center;
			padding: 0.8vw 0 0;
		}
		&__number {
			position: absolute;
			z-index: 1;
			top: 0.5vw;
			left: 0.5vw;
			font-size: 0.8vw;
			line-height: 0.8vw;
			color: black;
		}
	}
</style>