const { Schema, model } = require('mongoose');

const testCaseResultSchema = new Schema(
  {
    index:     { type: Number, required: true },
    passed:    { type: Boolean, required: true },
    stdout:    { type: String, default: '' },
    stderr:    { type: String, default: '' },
    exitCode:  { type: Number, default: 0 },
    timedOut:  { type: Boolean, default: false },
  },
  { _id: false }
);

const submissionSchema = new Schema(
  {
    submissionId: { type: String, required: true, unique: true, index: true },
    language:     { type: String, required: true },
    verdict:      {
      type: String,
      enum: ['pending', 'accepted', 'wrong_answer', 'time_limit_exceeded', 'runtime_error'],
      default: 'pending',
    },
    allPassed:    { type: Boolean },
    results:      [testCaseResultSchema],
    completedAt:  { type: Date },
  },
  { timestamps: true }
);

module.exports = model('Submission', submissionSchema);
