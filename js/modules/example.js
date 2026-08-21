export default function example() {
  console.log('I have been imported through native ESM.');

  // If you need to use a Drupal Behavior:
  // https://www.drupal.org/docs/drupal-apis/javascript-api/javascript-api-overview
  Drupal.behaviors.customBehavior = {
    attach: (context, settings) => {
      // Execute code.
    }
  };

}
