<template>
	<div class="crossword container">
		<!-- <h1>Today's Crossword:<br/>{{ data.title }}</h1>
		<p>{{ data.dow }}<br/>By: {{ data.author }}<br/><small>&copy; {{ data.copyright }}</small></p> -->

		<div class="crossword__grid mb-3">
			<div 
				class="grid" 
				:data-column-count="columnCount" 
				:style="'grid-template-columns: ' + columnStyle + ';'"
			>
				<div 
					v-for="(gridItem, index) in grid" 
					:key="index" 
					class="grid__square square">
					<div v-if="gridItem.letter === '.'" class="square__inner square__inner--blank"></div>
					<div v-else class="square__inner square__inner--full">
						<input 
							type="text" 
							v-on:click="selectWord" 
							v-on:keyup="validateInput" 
							:data-across-clue-index="gridItem.acrossClueIndex" 
							:data-across-answer-length="gridItem.acrossAnswerLength" 
							:data-down-clue-index="gridItem.downClueIndex" 
							:data-down-answer-length="gridItem.downAnswerLength" 
							:data-answer="gridItem.letter" 
							:placeholder="gridItem.letter" 
							class="square__letter" 
							maxlength = "1"
						/>
						<span v-if="gridItem.isFirstLetter" class="square__number">{{gridItem.number}}</span>
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
			grid: [],
			cluesAcross: [],
			cluesDown: [],
			columnCount: 0,
			columnStyle: ''
		}
	},
	methods: {
		getCrosswords() {
			// add loading spinner or something here
			$.getJSON("https://www.xwordinfo.com/JSON/Data.aspx?callback=?", { date: 'current' }, result => {
				
				this.data = result;
				this.cluesAcross = this.data.clues.across;
				this.cluesDown = this.data.clues.down;
				this.columnCount = this.data.size.cols;
				this.columnStyle;
				this.grid = [];

				// loop through data to figure out how many columns are needed for columnStyle
				for (var index = 0; index < this.columnCount; index++) {
					this.columnStyle = this.columnStyle + 'auto '
				}

				// build new grid array for displaying puzzle'
				this.data.grid.forEach((letter, letterIndex) => {
					let gridItem = {
						number: this.data.gridnums[letterIndex],
						letter: letter,
						isFirstLetter: this.data.gridnums[letterIndex] !== 0
					};

					if (gridItem.isFirstLetter) {
						// find across clue and answer length
						this.data.clues.across.forEach((clue, clueIndex) => {
							let clueNumber = clue.split('. ')[0];
							if (gridItem.number === parseInt(clueNumber)) {
								gridItem.accrossClueIndex = clueIndex;
								gridItem.acrossAnswerLength = this.data.answers.across[clueIndex].length;
							}
						});
						// find down clue and answer length
						this.data.clues.down.forEach((clue, clueIndex) => {
							let clueNumber = clue.split('. ')[0];
							if (gridItem.number === parseInt(clueNumber)) {
								gridItem.downClueIndex = clueIndex;
								gridItem.downAnswerLength = this.data.answers.down[clueIndex].length;
							}
						});
					}
					
					this.grid.push(gridItem);
				});

				console.log('data:', this.data);
				console.log('grid:', this.grid);
			})
		},
		selectAcross($square, acrossLength) {
			$square.siblings().removeClass('selected selected--across selected--down');
			let $selectedSquare = $square;

			for (let index = 0; index < acrossLength; index++) {
				$selectedSquare.addClass('selected selected--across');
				$selectedSquare = $selectedSquare.next();
			}
		},
		selectDown($square, downLength, columnCount) {
			$square.siblings().removeClass('selected selected--across selected--down');
			let $selectedSquare = $square;
			for (let index = 0; index < downLength; index++) {
				$selectedSquare.addClass('selected selected--down');
				for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
					$selectedSquare = $selectedSquare.next();
				}
			}
		},
		selectWord: function(event) {
			const $input = $(event.target);
			const acrossLength = $input.data('across-answer-length');
			const downLength = $input.data('down-answer-length');
			const columnCount = $input.closest('.grid').data('column-count');
			const $square = $input.closest('.square');
			const isSelected = $square.hasClass('selected');
			const isSelectedAcross = $square.hasClass('selected--across');
			const isSelectedDown = $square.hasClass('selected--down');
			const isFirstLetterOfAcross = !isNaN(acrossLength);
			const isFirstLetterOfDown = !isNaN(downLength);
			
			if (!isSelected) {
				if (isFirstLetterOfAcross) {
					this.selectAcross($square, acrossLength);
				} else if (isFirstLetterOfDown) {
					this.selectDown($square, downLength, columnCount);
				}
			} else {
				if (isSelectedAcross && isFirstLetterOfDown) {
					this.selectDown($square, downLength, columnCount);
				}
				if (isSelectedDown && isFirstLetterOfAcross) {
					this.selectAcross($square, acrossLength);
				}
			}
		},
		validateInput: function(event) {
			let $input = $(event.target);
			// let enteredLetter = event.target.value.toUpperCase();
			// let correctLetter = $input.data('answer');

			if ($input.closest('.square').next().find('.square__inner--full').length) {
				$input.closest('.square').next().find('.square__inner--full').find('.square__letter').focus();
			} else {
				$(event.target).blur();
				// check for correct word here
			}
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
		font-family: 'Exo', sans-serif;
	}
	.square {
		font-size: 2vw;
		height: 0;
		padding-bottom: 100%;
		position: relative;
		&.selected {
			outline: 1px solid orange;
		}
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
				background: #666;
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
			background: transparent;
			color: yellow;
			text-transform: uppercase;
			text-shadow: 0 0 0.7vw black;
			font-weight: 800;
			&::placeholder {
				color: gray;
			}
			&:focus {
				outline: none;
				background: #333;
			}
		}
		&__number {
			position: absolute;
			z-index: 1;
			top: 0.5vw;
			left: 0.5vw;
			font-size: 1vw;
			line-height: 1vw;
			font-weight: 500;
			color: white;
		}
	}
</style>