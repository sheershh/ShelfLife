// User: an account. Saved foods are stored on the user as a list of food slugs.
import mongoose from 'mongoose'

export const ROLES = ['user', 'admin']

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    // `unique` creates a unique index, so MongoDB itself rejects a second account with the same email.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // `select: false` means queries leave the hash out unless we explicitly ask for it (only login does).
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' },
    savedFoods: { type: [String], default: [] },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)

// The safe shape to send to the browser (never includes the password hash).
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
})
