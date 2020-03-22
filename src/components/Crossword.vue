<template>
	<div class="crossword container">
		<!-- <h1>Today's Crossword:<br/>{{ data.title }}</h1>
		<p>{{ data.dow }}<br/>By: {{ data.author }}<br/><small>&copy; {{ data.copyright }}</small></p> -->

		<div class="crossword__grid mb-3 mt-3">
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
							v-on:keydown="handleKeydown" 
							:data-is-first-letter="gridItem.isFirstLetter" 
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
								gridItem.acrossClueIndex = clueIndex;
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

				// console.log('data:', this.data);
				// console.log('grid:', this.grid);
			})
		},
		selectAcross($square, acrossLength) {
			$square.siblings().add($square).removeClass('selected selected--across selected--down');
			let $selectedSquare = $square;

			for (let index = 0; index < acrossLength; index++) {
				$selectedSquare.addClass('selected selected--across');
				$selectedSquare = $selectedSquare.next();
			}
		},
		selectDown($square, downLength) {
			$square.siblings().add($square).removeClass('selected selected--across selected--down');
			let $selectedSquare = $square;
			for (let index = 0; index < downLength; index++) {
				$selectedSquare.addClass('selected selected--down');
				for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex++) {
					$selectedSquare = $selectedSquare.next();
				}
			}
		},
		findFirstLetterOfAcrossAndSelect($square) {
			let $previousSquare = $square.prev();
			while ($previousSquare.length) {
				if ($previousSquare.find('[data-across-answer-length]').length) {
					let acrossLength = $previousSquare.find('[data-across-answer-length]').data('across-answer-length');
					this.selectAcross($previousSquare, acrossLength);
					break;
				}
				$previousSquare = $previousSquare.prev();
			}
		},
		findFirstLetterOfDownAndSelect($square) {
			for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex++) {
				$square = $square.prev();
			}
			while ($square.length) {
				if ($square.find('[data-down-answer-length]').length) {
					let downLength = $square.find('[data-down-answer-length]').data('down-answer-length');
					this.selectDown($square, downLength, this.columnCount);
					break;
				}
				for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex++) {
					$square = $square.prev();
				}
			}
		},
		selectWord: function(event) {
			const $input = $(event.target);
			const acrossLength = $input.data('across-answer-length');
			const downLength = $input.data('down-answer-length');
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
					this.selectDown($square, downLength, this.columnCount);
				} else {
					this.findFirstLetterOfAcrossAndSelect($square);
				}
			} else {
				if (isSelectedAcross) {
					if (isFirstLetterOfDown) {
						this.selectDown($square, downLength, this.columnCount);
					} else {
						this.findFirstLetterOfDownAndSelect($square, this.columnCount);
					}
				}
				if (isSelectedDown) {
					if (isFirstLetterOfAcross) {
						this.selectAcross($square, acrossLength);
					} else {
						this.findFirstLetterOfAcrossAndSelect($square);
					}
				}
			}
		},
		validateWord: function() {
			if ($('.square.selected').length === $('.square.selected.correct').length) {
				$('.square.selected').addClass('complete');
			}
		},
		moveSquareLeft: function($square, $input) {
			if ($square.prev().find('.square__inner--full').length) {
				$square.prev().find('.square__inner--full').find('.square__letter').focus();
			} else {
				$input.blur();
			}
		},
		moveSquareUp: function($square, $input) {
			let $previousSquare = $square;
			for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex++) {
				$previousSquare = $previousSquare.prev();
			}
			if ($previousSquare.find('.square__inner--full').length) {
				$previousSquare.find('.square__inner--full').find('.square__letter').focus();
			} else {
				$input.blur();
			}
		},
		moveSquareRight: function($square, $input) {
			if ($square.next().find('.square__inner--full').length) {
				$square.next().find('.square__inner--full').find('.square__letter').focus();
			} else {
				$input.blur();
			}
		},
		moveSquareDown: function($square, $input) {
			let $nextSquare = $square;
			for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex++) {
				$nextSquare = $nextSquare.next();
			}
			if ($nextSquare.find('.square__inner--full').length) {
				$nextSquare.find('.square__inner--full').find('.square__letter').focus();
			} else {
				$input.blur();
			}
		},
		validateInput: function(event) {
			const $input = $(event.target);
			const keycode = event.which;
			const $square = $input.closest('.square');
			const letters = /^[A-Za-z]+$/;
			const enteredLetter = $input.val().toUpperCase();
			const correctLetter = $input.data('answer');

			if (keycode === 8) { // backspace
				if (!$square.hasClass('complete')) {
					$input.val('');
				}
				if ($square.hasClass('selected--across')) {
					this.moveSquareLeft($square, $input);
				} else if ($square.hasClass('selected--down')) {
					this.moveSquareUp($square, $input);
				}
				
			} else {
				if ($input.val().match(letters)) {
					if ($square.hasClass('selected--across')) {
						this.moveSquareRight($square, $input);
					} else if ($square.hasClass('selected--down')) {
						this.moveSquareDown($square, $input);
					}
					if (enteredLetter === correctLetter) {
						$square.addClass('correct');
						this.validateWord();
					}
				} else {
					$input.val('');
				}
			}
		},
		handleKeydown: function(event) {
			const keycode = event.which;
			if (keycode === 8) {
				event.preventDefault();
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
			outline: 1px solid yellow;
		}
		&.correct {
			//outline: 1px solid orange;
		}
		&.complete {
			//outline: 1px solid orangered;
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
			.complete & {
				color: orangered;
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