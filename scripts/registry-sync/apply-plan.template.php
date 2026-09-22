<?php

/**
 * @file
 * GENERATED registry applier (TERC-46) — do not edit; regenerate with
 * make-plan.mjs. Applies the embedded station/destination plan with the
 * entity API. Idempotent. Run via drush:
 *   drush scr apply-plan.generated.php -- --dry-run   (plan only)
 *   drush scr apply-plan.generated.php                (apply)
 */

use Drupal\node\Entity\Node;

$plan = json_decode('__PLAN_JSON__', TRUE);
$dry = in_array('--dry-run', $extra ?? [], TRUE);
$say = function (string $action, string $label, string $detail = '') use ($dry) {
  echo ($dry ? '[dry-run] ' : '') . str_pad($action, 8) . ' ' . $label . ($detail !== '' ? ' — ' . $detail : '') . PHP_EOL;
};

$fieldDefs = \Drupal::service('entity_field.manager')->getFieldDefinitions('node', 'station');
$hasStatusField = isset($fieldDefs['field_station_status']);
$allowedTypes = array_keys($fieldDefs['field_station_type']->getSetting('allowed_values') ?? []);

// field_location_zoom (TERC-89): the destination's framing ceiling. Detected
// from the bundle's field definitions, like field_station_status, so a site
// that predates the field still applies — it just warns once.
$locationDefs = \Drupal::service('entity_field.manager')->getFieldDefinitions('node', 'lake_locations');
$hasZoomField = isset($locationDefs['field_location_zoom']);
$zoomWarned = FALSE;

$storage = \Drupal::entityTypeManager()->getStorage('node');
// Stations a dry run WOULD create. They have no nid yet, but they will exist
// by the time a real run reaches destinations — so their refs are not
// "unresolved". Without this, a first dry run against an empty site flagged
// every destination ref. Only ever consulted under --dry-run.
$planned = [];
$stationUuids = [];
$skipped = 0;

foreach ($plan['stations'] as $s) {
  $key = $s['family'] . ':' . ($s['id'] ?? '');
  if (!in_array($s['family'], $allowedTypes, TRUE)) {
    $say('skip', $key, 'field_station_type has no "' . $s['family'] . '" value yet');
    $skipped++;
    continue;
  }
  $query = \Drupal::entityQuery('node')->condition('type', 'station')
    ->condition('field_station_type', $s['family'])->accessCheck(FALSE);
  $s['id'] === NULL
    ? $query->notExists('field_station_id')
    : $query->condition('field_station_id', $s['id']);
  $nids = $query->execute();
  $node = $nids ? Node::load(reset($nids)) : NULL;

  if (!$node) {
    $say('create', $key, $s['name']);
    if (!$dry) {
      $node = Node::create([
        'type' => 'station',
        'title' => $s['name'],
        'status' => 1,
        'field_station_id' => $s['id'],
        'field_station_type' => $s['family'],
        'field_location_geo_data' => ['lat' => $s['lat'], 'lng' => $s['lng']],
      ] + ($hasStatusField && $s['observedStatus'] ? ['field_station_status' => $s['observedStatus']] : []));
      $node->save();
    }
  }
  else {
    $changed = [];
    if ($node->label() !== $s['name']) { $node->setTitle($s['name']); $changed[] = 'title'; }
    if (!$node->isPublished()) { $node->setPublished(); $changed[] = 'status'; }
    $geo = $node->get('field_location_geo_data');
    if ($geo->isEmpty() || abs($geo->lat - $s['lat']) > 1e-6 || abs($geo->lng - $s['lng']) > 1e-6) {
      $node->set('field_location_geo_data', ['lat' => $s['lat'], 'lng' => $s['lng']]);
      $changed[] = 'geo';
    }
    if ($hasStatusField && $s['observedStatus'] && $node->get('field_station_status')->value !== $s['observedStatus']) {
      $node->set('field_station_status', $s['observedStatus']);
      $changed[] = 'station_status';
    }
    if ($changed) {
      $say('update', $key, $s['name'] . ': ' . implode(', ', $changed));
      if (!$dry) { $node->save(); }
    }
    else {
      $say('ok', $key, $s['name']);
    }
  }
  if ($node) { $stationUuids[$key] = $node->uuid(); $stationNids[$key] = $node->id(); }
  elseif ($dry) { $planned[$key] = TRUE; }
}

if (!$hasStatusField) {
  $say('warn', 'field_station_status', 'not on the station type yet; observed statuses not written');
}

foreach ($plan['destinations'] as $d) {
  $refs = [];
  $missing = [];
  foreach ($d['stations'] as $key) {
    if (isset($stationNids[$key])) { $refs[] = ['target_id' => $stationNids[$key]]; }
    elseif (isset($planned[$key])) { $refs[] = ['target_id' => 0]; }  // dry run only: never saved
    else { $missing[] = $key; }
  }
  if ($missing) { $say('warn', $d['slug'], 'unresolved station refs: ' . implode(', ', $missing)); }

  $zoom = isset($d['zoom']) && is_numeric($d['zoom']) ? (float) $d['zoom'] : NULL;
  $writeZoom = $zoom !== NULL && $hasZoomField;
  if ($zoom !== NULL && !$hasZoomField && !$zoomWarned) {
    $zoomWarned = TRUE;
    $say('warn', 'lake_locations', 'field_location_zoom not on the type yet; zoom not written');
  }

  $nids = \Drupal::entityQuery('node')->condition('type', 'lake_locations')
    ->condition('field_location_id', $d['slug'])->accessCheck(FALSE)->execute();
  $node = $nids ? Node::load(reset($nids)) : NULL;

  if (!$node) {
    $say('create', $d['slug'], $d['name'] . ($writeZoom ? " [zoom: {$zoom}]" : ''));
    if (!$dry) {
      Node::create([
        'type' => 'lake_locations',
        'title' => $d['name'],
        'status' => 1,
        'field_location_id' => $d['slug'],
        'field_location_geo_data' => ['lat' => $d['lat'], 'lng' => $d['lng']],
        'field_stations' => $refs,
      ] + ($writeZoom ? ['field_location_zoom' => $zoom] : []))->save();
    }
    continue;
  }
  $changed = [];
  if ($node->label() !== $d['name']) { $node->setTitle($d['name']); $changed[] = 'title'; }
  if (!$node->isPublished()) { $node->setPublished(); $changed[] = 'status'; }
  $geo = $node->get('field_location_geo_data');
  if ($geo->isEmpty() || abs($geo->lat - $d['lat']) > 1e-6 || abs($geo->lng - $d['lng']) > 1e-6) {
    $node->set('field_location_geo_data', ['lat' => $d['lat'], 'lng' => $d['lng']]);
    $changed[] = 'geo';
  }
  $current = array_map(fn($i) => (int) $i['target_id'], $node->get('field_stations')->getValue());
  $wanted = array_map(fn($r) => (int) $r['target_id'], $refs);
  sort($current); sort($wanted);
  if ($current !== $wanted) { $node->set('field_stations', $refs); $changed[] = 'field_stations'; }
  if ($writeZoom) {
    // The field stores a decimal STRING ("11.25", "13.00"); compare as numbers
    // or every run reports a change. Empty counts as unset.
    $cur = $node->get('field_location_zoom')->value;
    if ($cur === NULL || $cur === '' || abs((float) $cur - $zoom) > 1e-6) {
      $node->set('field_location_zoom', $zoom);
      $changed[] = 'field_location_zoom (' . ($cur ?? 'null') . " -> {$zoom})";
    }
  }
  if ($changed) {
    $say('update', $d['slug'], implode(', ', $changed));
    if (!$dry) { $node->save(); }
  }
  else {
    $say('ok', $d['slug'], $d['name']);
  }
}

echo $skipped ? "done with {$skipped} skipped station(s)" . PHP_EOL : 'done' . PHP_EOL;
