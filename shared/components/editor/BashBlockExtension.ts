import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import BashBlockComponent from './BashBlock';

export const BashBlockExtension = Node.create({
  name: 'bashBlock',

  group: 'block',

  atom: true, // This is an atomic node (treated as one unit by the editor, helps with deletion)

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: element => element.getAttribute('data-code'),
        renderHTML: attributes => {
          return {
            'data-code': attributes.code,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div.copy-block-embed', // Legacy HTML parsing rule
      },
      {
        tag: 'bash-block', // New standard rule
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['bash-block', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BashBlockComponent)
  },
});
