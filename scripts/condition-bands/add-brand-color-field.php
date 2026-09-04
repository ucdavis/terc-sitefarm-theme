<?php

/**
 * @file
 * TERC-60: add the optional brand-color reference to condition_bands terms.
 *
 * Adds `field_band_brand_color` — an entity reference from a condition_bands
 * term to an sf_branding term (SiteFarm's own brand vocabulary), edited with
 * a plain select widget — so editors can pick each band's chip color from
 * the UC Davis palette in the same taxonomy screen where they write the
 * band. Core Field UI config only; no modules. Idempotent: re-running on a
 * site that already has the field changes nothing.
 *
 * Local:
 *   ddev drush scr sites/default/themes/terc/scripts/condition-bands/add-brand-color-field.php
 * tercdev (ACSF alias; copy the file where remote drush can read it):
 *   drush @ucdsitefarm.01dev --uri=https://tercdev.sf.ucdavis.edu scr add-brand-color-field.php
 *
 * Code reads the referenced term's `field_sf_brand_color` identifier over
 * JSON:API (`include=field_band_brand_color`) and resolves it to an
 * audited chip treatment; an unset reference keeps the tone default.
 */

use Drupal\Core\Entity\Entity\EntityFormDisplay;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;

const TERC_FIELD = 'field_band_brand_color';
const TERC_BUNDLE = 'condition_bands';

$vocabularies = \Drupal::entityTypeManager()->getStorage('taxonomy_vocabulary');
foreach ([TERC_BUNDLE, 'sf_branding'] as $vid) {
  if (!$vocabularies->load($vid)) {
    throw new \RuntimeException("Vocabulary '$vid' is missing on this site — nothing changed.");
  }
}

$storage = FieldStorageConfig::loadByName('taxonomy_term', TERC_FIELD);
if (!$storage) {
  $storage = FieldStorageConfig::create([
    'field_name' => TERC_FIELD,
    'entity_type' => 'taxonomy_term',
    'type' => 'entity_reference',
    'settings' => ['target_type' => 'taxonomy_term'],
    'cardinality' => 1,
  ]);
  $storage->save();
  print "created field storage taxonomy_term." . TERC_FIELD . "\n";
}
else {
  print "field storage already present\n";
}

$field = FieldConfig::loadByName('taxonomy_term', TERC_BUNDLE, TERC_FIELD);
if (!$field) {
  $field = FieldConfig::create([
    'field_storage' => $storage,
    'bundle' => TERC_BUNDLE,
    'label' => 'Brand color',
    'description' => 'Optional. The UC Davis brand color for this band’s chip, chosen from the site’s brand vocabulary. Leave unset to use the tone’s default color.',
    'required' => FALSE,
    'settings' => [
      'handler' => 'default:taxonomy_term',
      'handler_settings' => [
        'target_bundles' => ['sf_branding' => 'sf_branding'],
        'sort' => ['field' => 'name', 'direction' => 'asc'],
        'auto_create' => FALSE,
      ],
    ],
  ]);
  $field->save();
  print "created field instance on " . TERC_BUNDLE . "\n";
}
else {
  print "field instance already present\n";
}

// Select widget after the tone, so the two color-related choices sit together.
$form = EntityFormDisplay::load('taxonomy_term.' . TERC_BUNDLE . '.default')
  ?: EntityFormDisplay::create([
    'targetEntityType' => 'taxonomy_term',
    'bundle' => TERC_BUNDLE,
    'mode' => 'default',
    'status' => TRUE,
  ]);
if (!$form->getComponent(TERC_FIELD)) {
  $tone = $form->getComponent('field_band_tone');
  $form->setComponent(TERC_FIELD, [
    'type' => 'options_select',
    'weight' => ($tone['weight'] ?? 10) + 1,
    'settings' => [],
  ])->save();
  print "added select widget to the form display\n";
}
else {
  print "form widget already present\n";
}

// Not rendered on term pages — the chip color is consumed by the block.
$view = EntityViewDisplay::load('taxonomy_term.' . TERC_BUNDLE . '.default');
if ($view && $view->getComponent(TERC_FIELD)) {
  $view->removeComponent(TERC_FIELD)->save();
  print "hidden on the view display\n";
}

print "done\n";
