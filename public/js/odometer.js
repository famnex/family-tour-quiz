/**
 * Vintage Mechanical Odometer (Tachometer / Kilometerzähler)
 * Displays spinning mechanical digit wheels when points are scored.
 */
class Odometer {
  constructor(containerElement, digitsCount = 4) {
    this.container = containerElement;
    this.digitsCount = digitsCount;
    this.currentValue = 0;
    this.digitElements = [];
    this.init();
  }

  init() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.classList.add('odometer-wrapper');

    for (let i = 0; i < this.digitsCount; i++) {
      const wheel = document.createElement('div');
      wheel.className = 'odo-digit-wheel';

      const ribbon = document.createElement('div');
      ribbon.className = 'odo-digit-ribbon';

      // Create numbers 0 to 9 twice to enable infinite looping illusion
      for (let num = 0; num <= 19; num++) {
        const digitBox = document.createElement('div');
        digitBox.className = 'odo-digit-box';
        digitBox.textContent = num % 10;
        ribbon.appendChild(digitBox);
      }

      wheel.appendChild(ribbon);
      this.container.appendChild(wheel);
      this.digitElements.push(ribbon);
    }

    this.renderValue(0, false);
  }

  set(targetValue, animate = true) {
    const startVal = this.currentValue;
    const endVal = Math.max(0, targetValue);
    this.currentValue = endVal;

    if (!animate || startVal === endVal) {
      this.renderValue(endVal, false);
      return;
    }

    // Gradual increment animation for rolling tick sounds
    const diff = endVal - startVal;
    const duration = Math.min(1800, Math.max(600, Math.abs(diff) * 15));
    const startTime = performance.now();

    let lastTickVal = startVal;

    const step = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const intermediateVal = Math.round(startVal + diff * eased);

      if (intermediateVal !== lastTickVal) {
        if (typeof window.soundFx !== 'undefined' && window.soundFx.playPointsOdometerTick) {
          window.soundFx.playPointsOdometerTick();
        }
        lastTickVal = intermediateVal;
      }

      this.renderValue(intermediateVal, true);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.renderValue(endVal, true);
      }
    };

    requestAnimationFrame(step);
  }

  renderValue(val, smooth = true) {
    const strVal = String(Math.floor(val)).padStart(this.digitsCount, '0');
    const digits = strVal.split('').slice(-this.digitsCount);

    digits.forEach((digitChar, index) => {
      const ribbon = this.digitElements[index];
      if (!ribbon) return;

      const num = parseInt(digitChar, 10);
      const digitHeight = (ribbon.firstElementChild && ribbon.firstElementChild.offsetHeight > 0)
        ? ribbon.firstElementChild.offsetHeight
        : 28;
      const targetY = -(num * digitHeight);

      if (smooth) {
        ribbon.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)';
      } else {
        ribbon.style.transition = 'none';
      }

      ribbon.style.transform = `translateY(${targetY}px)`;
    });
  }
}

window.Odometer = Odometer;
