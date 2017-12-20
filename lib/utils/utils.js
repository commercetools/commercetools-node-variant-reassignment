export function unpublish (version) {
  return {
    version,
    actions: [{ action: 'unpublish' }]
  }
}

export function publish (version) {
  return {
    version,
    actions: [{ action: 'publish' }]
  }
}
