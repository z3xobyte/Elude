/**
 * Manages the intro animation sequence using anime.js and particles.js
 */
export class IntroAnimation {
  /**
   * Creates a new intro animation controller
   * @param {Object} options - Configuration options for the animation
   * @param {string} options.playerName - The player's name to display
   * @param {Function} options.onComplete - Callback function to execute when animation completes
   */
  constructor(options = {}) {
    this.playerName = options.playerName || 'Player';
    this.onComplete = options.onComplete || (() => {});
  }
  
  /**
   * Start the intro animation sequence
   */
  start() {
    const introOverlay = document.getElementById('intro-overlay');
    const orbitContainer = document.getElementById('intro-orbit-container');
    const playerElement = document.getElementById('intro-player');
    const textElement = document.getElementById('intro-text');
    const particlesContainer = document.getElementById('particles-js');

    if (!introOverlay || !orbitContainer || !playerElement || !textElement || !particlesContainer) {
      console.error("Intro animation elements not found for orbit animation!");
      this.onComplete();
      return;
    }

    introOverlay.style.display = 'block'; // Show the overlay (using block to let absolute positioning work inside)
    introOverlay.style.pointerEvents = 'auto'; 

    // Create welcome text element
    const welcomeTextElement = document.createElement('div');
    welcomeTextElement.id = 'intro-welcome-text';
    welcomeTextElement.style.position = 'absolute';
    welcomeTextElement.style.top = '35%';
    welcomeTextElement.style.left = '0';
    welcomeTextElement.style.width = '100%';
    welcomeTextElement.style.textAlign = 'center';
    welcomeTextElement.style.color = '#ffffff';
    welcomeTextElement.style.fontFamily = "'Baloo Paaji 2', sans-serif";
    welcomeTextElement.style.fontSize = '42px';
    welcomeTextElement.style.opacity = '0';
    welcomeTextElement.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.7)';
    welcomeTextElement.innerHTML = 'Welcome to Eluding!';
    introOverlay.appendChild(welcomeTextElement);

    // Initialize particles.js with our config
    try {
      particlesJS('particles-js', {
        "particles": {
          "number": {
            "value": 160,
            "density": {
              "enable": true,
              "value_area": 800
            }
          },
          "color": {
            "value": "#ffffff"
          },
          "shape": {
            "type": "circle",
            "stroke": {
              "width": 0,
              "color": "#484848"
            },
            "polygon": {
              "nb_sides": 5
            },
            "image": {
              "src": "img/github.svg",
              "width": 100,
              "height": 100
            }
          },
          "opacity": {
            "value": 1,
            "random": true,
            "anim": {
              "enable": true,
              "speed": 1,
              "opacity_min": 0,
              "sync": false
            }
          },
          "size": {
            "value": 23.67442924896818,
            "random": true,
            "anim": {
              "enable": false,
              "speed": 4,
              "size_min": 0.3,
              "sync": false
            }
          },
          "line_linked": {
            "enable": false,
            "distance": 150,
            "color": "#ffffff",
            "opacity": 0.4,
            "width": 1
          },
          "move": {
            "enable": true,
            "speed": 1,
            "direction": "none",
            "random": true,
            "straight": false,
            "out_mode": "out",
            "bounce": false,
            "attract": {
              "enable": false,
              "rotateX": 600,
              "rotateY": 600
            }
          }
        },
        "interactivity": {
          "detect_on": "canvas",
          "events": {
            "onhover": {
              "enable": false,
              "mode": "bubble"
            },
            "onclick": {
              "enable": false,
              "mode": "repulse"
            },
            "resize": true
          },
          "modes": {
            "grab": {
              "distance": 400,
              "line_linked": {
                "opacity": 1
              }
            },
            "bubble": {
              "distance": 287.7122877122877,
              "size": 19.98001998001998,
              "duration": 2,
              "opacity": 0,
              "speed": 3
            },
            "repulse": {
              "distance": 400,
              "duration": 0.4
            },
            "push": {
              "particles_nb": 4
            },
            "remove": {
              "particles_nb": 2
            }
          }
        },
        "retina_detect": true
      });
    } catch (e) {
      console.error("Failed to initialize particles.js:", e);
    }

    // --- Player Setup ---
    textElement.textContent = this.playerName;
    
    // Position player slightly lower to make room for welcome text
    playerElement.style.top = '55%';
    
    // Apply custom animation transforms for the larger player size
    playerElement.style.transform = 'scale(0.5)'; // Starting scale

    // --- Animation Timeline ---
    const animationDuration = 4000; // Shorter duration since we removed the orbit

    const timeline = anime.timeline({
      autoplay: true,
      easing: 'easeInOutSine', // Smoother easing
      complete: () => {
        introOverlay.style.display = 'none';
        introOverlay.style.pointerEvents = 'none';
        // Remove welcome text element
        if (welcomeTextElement.parentNode) {
          welcomeTextElement.parentNode.removeChild(welcomeTextElement);
        }
        // Call the completion callback
        this.onComplete();
      }
    });

    timeline
      // First, fade in the particles (stars)
      .add({
        targets: particlesContainer,
        opacity: [0, 1],
        duration: 800,
        easing: 'linear'
      })
      // Then, fade in the dark background (overlay)
      .add({
        targets: introOverlay,
        backgroundColor: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)'], // From transparent to dark
        duration: 500,
        easing: 'linear'
      }, '-=400') // Overlap with particles fade-in
      // Welcome text appears
      .add({
        targets: welcomeTextElement,
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 1000,
        easing: 'easeOutExpo'
      }, '-=200')
      // Player appears
      .add({
        targets: playerElement,
        opacity: [0, 1],
        transform: ['translate(0, 0) scale(0.5)', 'translate(0, 0) scale(1)'],
        duration: 1000,
      }, '-=300') // Overlap slightly with welcome text
      // Name appears below player
      .add({
        targets: textElement,
        opacity: [0, 1],
        duration: 800,
        easing: 'easeOutExpo'
      }, '-=700') // Overlap with player appearance
      
      // Hold everything visible for a moment
      .add({
        targets: {},
        duration: 1000
      })

      // Fade out everything before completion
      .add({
        targets: [welcomeTextElement, playerElement, textElement],
        opacity: 0,
        duration: 800,
        easing: 'easeInExpo'
      })

      .add({
        targets: introOverlay,
        opacity: [1, 0],
        duration: 500,
        easing: 'linear'
      }, '-=500'); // Fade out overlay at the very end
  }
} 