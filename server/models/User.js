import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Only the bcrypt hash is stored, and it is never returned unless asked for explicitly.
    passwordHash: { type: String, required: true, select: false },
    // Each user's own saved foods, stored as references to the foods collection.
    savedFoods: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Food' }],
  },
  { timestamps: true },
)

// Safe shape to send to the browser.
userSchema.methods.toPublic = function toPublic() {
  return { id: this.id, name: this.name, email: this.email }
}

export default mongoose.model('User', userSchema)
