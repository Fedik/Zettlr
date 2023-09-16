/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        Item Mixin
 * CVM-Role:        Utility Function
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This file contains mixin properties for both the TreeItem and
 *                  FileItem Vue components, since both -- albeit looking
 *                  completely different -- implement much of the same functionality.
 *
 * END HEADER
 */

// This is a mixin that is being implemented by both the file item and tree item
// and contains shared logic that applies to both objects. This way, we have
// different styling for tree items and file list items, but the same underlying
// logic, since both represent the same data structures.
import fileContextMenu from './file-item-context'
import dirContextMenu from './dir-item-context'
import PopoverFileProps from './PopoverFileProps.vue'
import PopoverDirProps from './PopoverDirProps.vue'

import { nextTick } from 'vue'

const ipcRenderer = window.ipc

export default {
  props: {
    obj: {
      type: Object,
      default: function () { return {} }
    },
    windowId: {
      type: String,
      required: true
    }
  },
  data: function () {
    return {
      nameEditing: false // True if the user wants to rename the item
    }
  },
  computed: {
    isDirectory: function () {
      return this.obj.type === 'directory'
    },
    selectedFile: function () {
      return this.$store.getters.lastLeafActiveFile()
    },
    selectedDir: function () {
      return this.$store.state.selectedDirectory
    }
  },
  watch: {
    nameEditing: function (newVal, oldVal) {
      if (newVal === false) {
        return // No need to select
      }

      nextTick().then(() => {
        this.$refs['name-editing-input'].focus()
        // Select from the beginning until the last dot
        this.$refs['name-editing-input'].setSelectionRange(
          0,
          this.$refs['name-editing-input'].value.lastIndexOf('.')
        )
      })
        .catch(err => console.error(err))
    }
  },
  methods: {
    /**
     * Requests a file or directory to be selected and sends an appropriate
     * request to main.
     *
     * @param   {KeyboardEvent|MouseEvent}  event  The triggering event
     */
    requestSelection: function (event) {
      // Dead directories can't be opened, so stop the propagation to
      // the file manager and don't do a thing.
      if (this.obj.dirNotFoundFlag === true) {
        return event.stopPropagation()
      }

      if (event.button === 2) {
        return // The user requested a context menu
      }

      // Determine if we have a middle (wheel) click. The event-type check is
      // necessary since the left mouse button will have index 1 on click events,
      // whereas the middle mouse button will also have index 1, but on auxclick
      // events.
      const middleClick = (event.type === 'auxclick' && event.button === 1)
      const alt = event.altKey
      const type = this.obj.type

      if (middleClick) {
        event.preventDefault() // Otherwise, on Windows we'd have a middle-click-scroll
      }

      if ([ 'file', 'code' ].includes(type)) {
        // Request the clicked file
        ipcRenderer.invoke('documents-provider', {
          command: 'open-file',
          payload: {
            path: this.obj.path,
            windowId: this.windowId,
            leafId: this.$store.state.lastLeafId,
            newTab: middleClick || (alt && type === 'file') // Force a new tab in this case.
          }
        })
          .catch(e => console.error(e))
      } else if (alt && this.obj.parent !== null) {
        // Select the parent directory
        ipcRenderer.invoke('application', {
          command: 'set-open-directory',
          payload: this.obj.parent.path
        })
          .catch(e => console.error(e))
      } else if (type === 'directory') {
        if (this.selectedDir === this.obj) {
          // The clicked directory was already the selected directory, so just
          // tell the application to show the file list, if applicable.
          this.$root.toggleFileList()
        } else {
          // Select this directory
          ipcRenderer.invoke('application', {
            command: 'set-open-directory',
            payload: this.obj.path
          })
            .catch(e => console.error(e))
        }

        // Also uncollapse (only applies in file trees)
        if (this.hasChildren === true) {
          this.collapsed = this.collapsed === false
        }
      }
    },
    /**
     * Handles a context menu on a file or directory item.
     *
     * @param   {MouseEvent}  event  The triggering contextmenu event
     */
    handleContextMenu: function (event) {
      // We need to tweak some minor things depending on whether this is a
      // FileItem or a TreeItem. NOTE: These things were determined by diffing
      // the original handleContextMenu functions in both components.
      const treeItem = this.$options.name === 'TreeItem'

      if (this.isDirectory === true) {
        dirContextMenu(event, this.obj, this.$el, (clickedID) => {
          if (clickedID === 'menu.rename_dir') {
            this.nameEditing = true
          } else if (clickedID === 'menu.new_file') {
            if (treeItem) {
              this.operationType = 'createFile'
            } else {
              this.$emit('create-file')
            }
          } else if (clickedID === 'menu.new_dir') {
            if (treeItem) {
              this.operationType = 'createDir'
            } else {
              this.$emit('create-dir')
            }
          } else if (clickedID === 'menu.delete_dir') {
            ipcRenderer.invoke('application', {
              command: 'dir-delete',
              payload: { path: this.obj.path }
            })
              .catch(err => console.error(err))
          } else if (clickedID === 'menu.close_workspace') {
            ipcRenderer.invoke('application', {
              command: 'root-close',
              payload: this.obj.path
            })
              .catch(err => console.error(err))
          } else if (clickedID === 'menu.project_build') {
            // We should trigger an export of this project.
            ipcRenderer.invoke('application', {
              command: 'dir-project-export',
              payload: this.obj.path
            })
              .catch(err => console.error(err))
          } else if (clickedID === 'menu.properties') {
            const data = { directoryPath: this.obj.path }

            const elem = (treeItem) ? this.$refs['display-text'] : this.$el

            this.$showPopover(PopoverDirProps, elem, data, (data) => {
              if (data.closePopover === true) {
                this.$closePopover()
              }
            })
          }
        })
      } else {
        fileContextMenu(event, this.obj, this.$el, (clickedID) => {
          if (clickedID === 'new-tab') {
            // Request the clicked file, explicitly in a new tab
            ipcRenderer.invoke('documents-provider', {
              command: 'open-file',
              payload: {
                path: this.obj.path,
                windowId: this.windowId,
                newTab: true
              }
            })
              .catch(e => console.error(e))
          } else if (clickedID === 'menu.rename_file') {
            this.nameEditing = true
          } else if (clickedID === 'menu.duplicate_file') {
            ipcRenderer.invoke('application', {
              command: 'file-duplicate',
              payload: {
                path: this.obj.path,
                windowId: this.windowId,
                leafId: this.$store.state.lastLeafId
              }
            })
              .catch(err => console.error(err))
          } else if (clickedID === 'menu.delete_file') {
            ipcRenderer.invoke('application', {
              command: 'file-delete',
              payload: { path: this.obj.path }
            })
              .catch(err => console.error(err))
          } else if (clickedID === 'properties') {
            const data = {
              filepath: this.obj.path,
              filename: this.obj.name,
              creationtime: this.obj.creationtime,
              modtime: this.obj.modtime,
              tags: this.obj.tags,
              // We need to provide the coloured tags so
              // the popover can render them correctly
              colouredTags: this.$store.state.colouredTags,
              targetValue: 0,
              targetMode: 'words',
              fileSize: this.obj.size,
              type: this.obj.type,
              words: 0,
              ext: this.obj.ext
            }

            const target = this.getWritingTarget(this.obj.path)
            if (target !== undefined) {
              data.targetValue = target.count
              data.targetMode = target.mode
            }

            if (this.obj.type === 'file') {
              data.words = this.obj.wordCount
            }

            const elem = (treeItem) ? this.$refs['display-text'] : this.$el

            this.$showPopover(PopoverFileProps, elem, data, (data) => {
            })
          } else if (clickedID === 'menu.close_file') {
            // The close_file item is only shown in the tree view on root files
            ipcRenderer.invoke('application', {
              command: 'root-close',
              payload: this.obj.path
            })
              .catch(err => console.error(err))
          }
        })
      }
    },
    /**
     * Is called during drag operations.
     *
     * @param   {DragEvent}  event  The drag event.
     */
    onDragHandler: function (event) {
      if (this.isDirectory === true) {
        return // Directories cannot be dragged out of the app
      }

      // If the drag x/y-coordinates are about to leave the window, we
      // have to continue the drag in the main process (as it's being
      // dragged out of the window)
      const x = Number(event.x)
      const y = Number(event.y)
      const w = window.innerWidth
      const h = window.innerHeight

      if (x === 0 || y === 0 || x === w || y === h) {
        event.stopPropagation()
        event.preventDefault()

        ipcRenderer.send('window-controls', {
          command: 'drag-start',
          payload: { filePath: this.obj.path }
        })
      }
    },
    /**
     * Called when the user finishes renaming the represented item
     *
     * @param   {string}  newName  The new name given to the file or directory
     */
    finishNameEditing: function (newName) {
      if (newName === this.obj.name) {
        return // Not changed
      }

      const command = (this.obj.type === 'directory') ? 'dir-rename' : 'file-rename'

      ipcRenderer.invoke('application', {
        command,
        payload: {
          path: this.obj.path,
          name: newName
        }
      })
        .catch(e => console.error(e))
        .finally(() => { this.nameEditing = false })
    },
    getWritingTarget: function (filePath) {
      const targets = this.$store.state.writingTargets

      if (targets.length === 0) {
        return undefined
      }

      return targets.find(x => x.path === filePath)
    }
  }
}
